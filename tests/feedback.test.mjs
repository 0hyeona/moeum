import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/api/feedback.ts', import.meta.url), 'utf8');
const sdkUrl = new URL('../node_modules/@emailjs/browser/esm/index.js', import.meta.url).href;
const configured = { VITE_EMAILJS_SERVICE_ID: 'service_test', VITE_EMAILJS_TEMPLATE_ID: 'template_test', VITE_EMAILJS_PUBLIC_KEY: 'public_test' };
const input = { type: '기능 제안', message: '  변경사항 검색을 개선해주세요.  ', email: '' };
let sequence = 0;

async function fixture(t, env = configured) {
  const descriptors = Object.fromEntries(['fetch', 'navigator', 'location', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new Map();
  const calls = [];
  const navigator = { webdriver: false, languages: ['ko-KR'] };
  let respond = async () => new Response('OK', { status: 200 });
  for (const [key, value] of Object.entries({
    navigator,
    location: { pathname: '/projects' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: async (url, options) => { calls.push({ url, ...options }); return respond(url, options); },
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const code = ts.transpileModule(source.replace("'@emailjs/browser'", JSON.stringify(sdkUrl)).replaceAll('import.meta.env', JSON.stringify(env)) + `\n// fixture ${++sequence}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const api = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  return { api, calls, storage, navigator, respond: handler => { respond = handler; } };
}

test('incomplete EmailJS configuration never sends or reports success', async t => {
  for (const missing of Object.keys(configured)) {
    await t.test(missing, async st => {
      const { api, calls } = await fixture(st, { ...configured, [missing]: ' ' });
      assert.equal(api.isFeedbackConfigured(), false);
      await assert.rejects(api.sendFeedback(input), /아직 준비되지/);
      assert.equal(calls.length, 0);
    });
  }
});

test('valid feedback sends exactly the four documented fields using the public key', async t => {
  const { api, calls, storage } = await fixture(t);
  await api.sendFeedback({ ...input, email: ' member@example.com ' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.emailjs.com/api/v1.0/email/send');
  assert.equal(calls[0].method, 'POST');
  const body = JSON.parse(calls[0].body);
  assert.equal(body.service_id, configured.VITE_EMAILJS_SERVICE_ID);
  assert.equal(body.template_id, configured.VITE_EMAILJS_TEMPLATE_ID);
  assert.equal(body.user_id, configured.VITE_EMAILJS_PUBLIC_KEY);
  assert.equal('accessToken' in body, false);
  assert.deepEqual(Object.keys(body.template_params).sort(), ['feedback_message', 'feedback_type', 'submitted_at', 'user_email']);
  assert.equal(body.template_params.feedback_type, input.type);
  assert.equal(body.template_params.feedback_message, input.message.trim());
  assert.equal(body.template_params.user_email, 'member@example.com');
  assert.match(body.template_params.submitted_at, /\(KST\)$/);
  assert.equal([...storage.values()].some(value => value.includes('example.com') || value.includes('변경사항')), false);
});

test('email is optional, but provided email and required content are validated', async t => {
  const { api, calls } = await fixture(t);
  for (const bad of [
    { ...input, type: '' }, { ...input, type: '별점' }, { ...input, message: '  \n ' },
    { ...input, message: '가'.repeat(501) }, { ...input, email: 'invalid' },
    { ...input, email: 'a@example.com\nBcc:spam@example.com' }, { ...input, website: 'https://bot.invalid' },
  ]) await assert.rejects(api.sendFeedback(bad));
  assert.equal(calls.length, 0);
  await api.sendFeedback({ ...input, message: '가'.repeat(500) });
  assert.equal(JSON.parse(calls[0].body).template_params.user_email, '미입력');
});

test('concurrent submissions make one request and successful sends are throttled', async t => {
  const { api, calls, respond } = await fixture(t);
  let release;
  respond(() => new Promise(resolve => { release = () => resolve(new Response('OK')); }));
  const first = api.sendFeedback(input);
  await assert.rejects(api.sendFeedback(input), /이미 피드백/);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  release();
  await first;
  assert.equal(calls.length, 1);
  await assert.rejects(api.sendFeedback(input), /1분 후/);
  assert.equal(calls.length, 1);
  assert.ok(await api.feedbackRetryAfter() > 0);
});

test('provider and network failures stay failures and a later retry can succeed', async t => {
  const { api, calls, respond, storage } = await fixture(t);
  for (const handler of [
    async () => new Response('Invalid template', { status: 400 }),
    async () => { throw new TypeError('offline'); },
    async () => new Response(null, { status: 204 }),
  ]) {
    storage.set('moeum.feedback.last-request', '0');
    respond(handler);
    await assert.rejects(api.sendFeedback(input), /입력 내용은 유지/);
  }
  storage.set('moeum.feedback.last-request', '0');
  respond(async () => new Response('OK', { status: 200 }));
  await api.sendFeedback(input);
  assert.equal(calls.length, 4);
});

test('headless automation is blocked before making an EmailJS request', async t => {
  const { api, calls, navigator } = await fixture(t);
  navigator.webdriver = true;
  await assert.rejects(api.sendFeedback(input), /일반 브라우저/);
  assert.equal(calls.length, 0);
});

test('feedback still sends with an in-memory throttle when browser storage is unavailable', async t => {
  const { api, calls } = await fixture(t);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('storage unavailable'); } });
  await api.sendFeedback(input);
  await assert.rejects(api.sendFeedback(input), /1분 후/);
  assert.equal(calls.length, 1);
});

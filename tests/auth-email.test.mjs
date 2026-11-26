import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const client = moduleUrl((await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8'))
  .replaceAll('import.meta.env.DEV', 'true'));
const auth = await import(moduleUrl((await readFile(new URL('../src/api/auth.ts', import.meta.url), 'utf8'))
  .replace("'./client'", JSON.stringify(client))));

function mock(t, handler) {
  const saved = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => { globalThis.fetch = saved; });
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('an existing email is registered without requesting a password code or signing up', async t => {
  const calls = [];
  mock(t, async (url, options) => {
    calls.push(url);
    assert.equal(url, '/backend/api/auth/password/check-email');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { email: 'registered@example.com' });
    return json({ message: '가입된 이메일입니다.' });
  });
  assert.equal(await auth.isEmailRegistered('registered@example.com'), true);
  assert.equal(calls.length, 1);
});

test('a 404 from email lookup allows a new email to continue signup', async t => {
  mock(t, async () => json({ detail: '등록되지 않은 이메일 주소입니다. 다시 확인해주세요.' }, 404));
  assert.equal(await auth.isEmailRegistered('new@example.com'), false);
});

test('server errors and rate limits do not count as an available email', async t => {
  let responseStatus;
  mock(t, async () => json({ detail: '이메일 확인을 다시 시도해주세요.' }, responseStatus));
  for (const status of [422, 429, 503]) {
    responseStatus = status;
    await assert.rejects(auth.isEmailRegistered('new@example.com'), error => error.status === status);
  }
});

test('a network failure does not count as an available email', async t => {
  mock(t, async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(auth.isEmailRegistered('new@example.com'), /서버에 연결하지 못했습니다/);
});

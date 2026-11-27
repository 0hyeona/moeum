import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
let sequence = 0;
async function fixture(t) {
  const storage = new Map();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const fetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  } });
  t.after(() => {
    globalThis.fetch = fetch;
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor);
    else delete globalThis.sessionStorage;
  });
  const url = moduleUrl((await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8'))
    .replaceAll('import.meta.env.DEV', 'true') + `\n// fixture ${++sequence}`);
  const client = await import(url);
  const auth = await import(moduleUrl((await readFile(new URL('../src/api/auth.ts', import.meta.url), 'utf8'))
    .replace("'./client'", JSON.stringify(url))));
  return { client, auth, storage };
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const headers = token => ({ Authorization: 'Bearer ' + token });

test('email and GitHub login both store the server lifetime; OAuth codes are exchanged once', async t => {
  const { auth, storage } = await fixture(t);
  const calls = [];
  const start = Date.now();
  globalThis.fetch = async url => {
    calls.push(String(url));
    return json({ access_token: 'fixture-session', token_type: 'bearer', expires_in: 3600 });
  };
  await auth.login({ email: 'fixture@example.invalid', password: 'fixture-only' });
  assert.equal(storage.get('moeum.access_token'), 'fixture-session');
  assert.ok(Number(storage.get('moeum.session_expires_at')) >= start + 3600000);
  assert.ok(Number(storage.get('moeum.session_expires_at')) <= Date.now() + 3600000);
  await Promise.all([auth.completeGithubLogin('', '#login_code=fixture-code'), auth.completeGithubLogin('', '#login_code=fixture-code')]);
  assert.equal(calls.filter(url => url.endsWith('/github/exchange')).length, 1);
});

test('incorrect login credentials never expire an existing MOEUM session', async t => {
  const { client, auth } = await fixture(t);
  client.storeLoginSession('existing-session', 3600, Date.now());
  let expired = 0;
  client.subscribeSessionExpiration(() => expired++);
  globalThis.fetch = async () => json({ detail: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
  await assert.rejects(auth.login({ email: 'fixture@example.invalid', password: 'wrong' }), error => error.status === 401);
  assert.equal(client.getAccessToken(), 'existing-session');
  assert.equal(expired, 0);
});

test('a protected 401 expires once, aborts concurrent reads and keeps a re-login notice', async t => {
  const { client, storage } = await fixture(t);
  client.storeLoginSession('old-session', 3600, Date.now());
  let expired = 0, pendingSignal;
  client.subscribeSessionExpiration(() => expired++);
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/pending')) return new Promise((_, reject) => {
      pendingSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    return json({ detail: '유효하지 않거나 만료된 로그인입니다.' }, 401);
  };
  const pending = client.apiRequest('/pending', { headers: headers('old-session') });
  const canceled = assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(client.apiRequest('/api/projects/7/activities', { headers: headers('old-session') }), error => error.status === 401);
  await canceled;
  assert.equal(pendingSignal.aborted, true);
  assert.equal(expired, 1);
  assert.equal(client.getAccessToken(), null);
  assert.equal(client.getSessionExpiresAt(), null);
  assert.equal(storage.get('moeum.session_expired'), 'true');
  client.storeLoginSession('new-session', 3600, Date.now());
  assert.equal(client.hasExpiredSessionNotice(), false);
});

test('an old local deadline renews on the server before a protected request', async t => {
  const { client } = await fixture(t);
  client.storeLoginSession('expired-session', 1, Date.now() - 2000);
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return String(url).endsWith('/refresh')
      ? json({ access_token: 'expired-session', token_type: 'bearer', expires_in: 30 * 86400 })
      : json({ id: 7 });
  };
  assert.deepEqual(await client.apiRequest('/api/auth/me', { headers: headers('expired-session') }), { id: 7 });
  assert.deepEqual(calls, ['/backend/api/auth/refresh', '/backend/api/auth/me']);
  assert.ok(client.getSessionExpiresAt() > Date.now() + 29 * 86400000);
});

test('a late response from an old session cannot invalidate a newly logged-in session', async t => {
  const { client } = await fixture(t);
  client.storeLoginSession('previous-session', 3600, Date.now());
  let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const previous = client.apiRequest('/api/auth/me', { headers: headers('previous-session') });
  const canceled = assert.rejects(previous, { name: 'AbortError' });
  client.storeLoginSession('current-session', 3600, Date.now());
  finish(json({ detail: 'old rejection' }, 401));
  await canceled;
  assert.equal(client.getAccessToken(), 'current-session');
  assert.equal(client.hasExpiredSessionNotice(), false);
});

test('GitHub reconnection and transient errors keep the MOEUM session active', async t => {
  const { client } = await fixture(t);
  client.storeLoginSession('active-session', 3600, Date.now());
  globalThis.fetch = async () => json({ detail: 'GitHub 연결이 만료되었습니다.' }, 409,
    { 'X-Integration-Error': 'GITHUB_RECONNECT_REQUIRED' });
  await assert.rejects(client.apiRequest('/api/projects/7/github/branches', { headers: headers('active-session') }),
    error => error.status === 409 && error.code === 'GITHUB_RECONNECT_REQUIRED');
  globalThis.fetch = async () => json({ detail: '잠시 후 다시 시도해주세요.' }, 503);
  await assert.rejects(client.apiRequest('/api/projects/7/github/branches', { headers: headers('active-session') }), error => error.status === 503);
  assert.equal(client.getAccessToken(), 'active-session');
});

test('legacy sessions and non-JSON 401 responses still trigger global expiry', async t => {
  const { client, storage } = await fixture(t);
  storage.set('moeum.access_token', 'legacy-session');
  globalThis.fetch = async () => new Response('Unauthorized', { status: 401 });
  await assert.rejects(client.apiRequest('/api/auth/me', { headers: headers('legacy-session') }), error => error.status === 401);
  assert.equal(client.getAccessToken(), null);
  assert.equal(client.hasExpiredSessionNotice(), true);
});

test('cookie restoration works without JavaScript storage and concurrent renewal is deduplicated', async t => {
  const { client } = await fixture(t);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, '/backend/api/auth/refresh');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    return json({ access_token: 'restored-session', token_type: 'bearer', expires_in: 30 * 86400 });
  };
  const first = client.renewLoginSession(), second = client.renewLoginSession();
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(client.getAccessToken(), 'restored-session');
});

test('logout takes precedence over a delayed cookie restoration', async t => {
  const { client } = await fixture(t);
  let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = client.renewLoginSession();
  const canceled = assert.rejects(pending, { name: 'AbortError' });
  client.clearAccessToken();
  finish(json({ access_token: 'stale-restore', token_type: 'bearer', expires_in: 30 * 86400 }));
  await canceled;
  assert.equal(client.getAccessToken(), null);
});

test('a transient renewal failure does not erase a valid login', async t => {
  const { client } = await fixture(t);
  client.storeLoginSession('valid-session', 3600, Date.now());
  globalThis.fetch = async () => json({ detail: '일시적인 서버 오류입니다.' }, 503);
  await assert.rejects(client.renewLoginSession(), error => error.status === 503);
  assert.equal(client.getAccessToken(), 'valid-session');
  assert.equal(client.hasExpiredSessionNotice(), false);
});

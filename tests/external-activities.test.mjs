import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const data = moduleUrl(await readFile(new URL('../src/data/activity.ts', import.meta.url), 'utf8'));
const client = moduleUrl((await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8'))
  .replaceAll('import.meta.env.DEV', 'true'));
const auth = moduleUrl('export const getAccessToken = () => "test-access-token";');
const source = (await readFile(new URL('../src/api/externalActivities.ts', import.meta.url), 'utf8'))
  .replace("'./client'", JSON.stringify(client)).replace("'./auth'", JSON.stringify(auth))
  .replace("'../data/activity'", JSON.stringify(data));
const { loadExternalActivities, refreshFigmaPage, syncNotionActivities } = await import(moduleUrl(source));
const item = (id, source = 'figma', story_id = null) => ({ activity_id: id, project_id: 7, story_id,
  source, title: '수정 기록', description: '내용', source_url: 'https://example.com/resource', occurred_at: '2026-11-01T00:00:00' });
const json = (body, status = 200, headers) => new Response(JSON.stringify(body), { status, headers });
function mock(t, handler) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer test-access-token');
    assert.ok(options.signal);
    return handler(String(url), options);
  };
}
const request = (service = 'Figma', signal = new AbortController().signal) => ({ projectId: '7', service, signal });
const refresh = (cursor = null, signal = new AbortController().signal) => refreshFigmaPage('7', cursor, signal);
const ready = { running: false, can_sync: true, retry_after_seconds: 0, next_sync_at: null };

test('Figma reads all stored activity pages with GET only and excludes organized items', async t => {
  const calls = [];
  mock(t, (url, options) => {
    assert.equal(options.method, 'GET');
    assert.match(url, /^\/backend\/project_activities\?source=figma&unorganized=true&limit=100&offset=\d+&project_id=7$/);
    calls.push(url);
    return json(calls.length === 1 ? Array.from({ length: 100 }, (_, i) => item(i)) : [item(100), item(101, 'figma', 2)]);
  });
  const result = await loadExternalActivities(request());
  assert.equal(calls.length, 2);
  assert.match(calls[1], /offset=100&/);
  assert.equal(result.length, 101);
  assert.equal(result[0].id, 'figma:0');
  assert.equal(result[0].before, '');
  assert.equal(result[0].reference, 'https://example.com/resource');
});

test('each manual Figma refresh checks admission and collects one page with the supplied cursor', async t => {
  const calls = [];
  mock(t, (url, options) => {
    calls.push(`${options.method} ${url}`);
    if (url.endsWith('/sync-status')) return json(ready);
    return json(url.includes('?') ? { source: 'figma', has_next: false, next_cursor: null }
      : { source: 'figma', has_next: true, next_cursor: 'a/b?c' });
  });
  const { nextCursor } = await refresh();
  assert.equal(nextCursor, 'a/b?c');
  assert.equal(calls.length, 2);
  assert.deepEqual(await refresh(nextCursor), { nextCursor: null });
  assert.deepEqual(calls, [
    'GET /backend/api/projects/7/figma/sync-status', 'POST /backend/api/projects/7/figma/sync',
    'GET /backend/api/projects/7/figma/sync-status', 'POST /backend/api/projects/7/figma/sync?cursor=a%2Fb%3Fc',
  ]);
});

test('running and cooldown statuses stop Figma collection before the POST', async t => {
  const responses = [{ ...ready, running: true, can_sync: false }, { ...ready, can_sync: false, retry_after_seconds: 60 }];
  mock(t, (url, options) => {
    assert.equal(options.method, 'GET');
    assert.match(url, /\/figma\/sync-status$/);
    return json(responses.shift());
  });
  assert.match((await refresh()).message, /이미 진행 중/);
  const before = Date.now();
  const blocked = await refresh();
  assert.match(blocked.message, /대기 중/);
  assert.ok(blocked.retryAt >= before + 60_000);
});

test('Figma 429 uses a readable Retry-After header without trying to collect again', async t => {
  let count = 0;
  mock(t, (_, options) => {
    count++;
    return options.method === 'GET' ? json(ready) : json({ detail: 'figma 요청 한도 초과' }, 429, { 'Retry-After': '120' });
  });
  const before = Date.now();
  const result = await refresh();
  assert.equal(count, 2);
  assert.match(result.message, /한도 초과/);
  assert.ok(result.retryAt >= before + 120_000);
});

test('Figma 429 reads persisted status when Retry-After is hidden by CORS', async t => {
  const methods = [];
  mock(t, (_, options) => {
    methods.push(options.method);
    if (methods.length === 1) return json(ready);
    if (options.method === 'POST') return json({ detail: 'figma 요청 한도 초과' }, 429);
    return json({ ...ready, can_sync: false, retry_after_seconds: 3600 });
  });
  const before = Date.now();
  const result = await refresh();
  assert.deepEqual(methods, ['GET', 'POST', 'GET']);
  assert.ok(result.retryAt >= before + 3_600_000);
});

test('a concurrent server-side Figma collection is reported after a 409', async t => {
  mock(t, (_, options) => options.method === 'GET' ? json(ready)
    : json({ detail: 'Figma 수집이 이미 진행 중입니다. 저장된 변경사항을 조회하세요.' }, 409));
  assert.match((await refresh()).message, /이미 진행 중/);
});

test('Notion successful empty sync still reads existing DB activities; repeat refresh replaces result', async t => {
  let count = 0;
  const methods = [];
  mock(t, (url, options) => {
    methods.push(options.method);
    if (options.method === 'POST') return json({ source: 'notion', has_next: false, next_cursor: null, created: 0 });
    assert.match(url, /source=notion/);
    return json(count++ === 0 ? [item(2, 'notion')] : []);
  });
  assert.equal((await syncNotionActivities(request('Notion')))[0].id, 'notion:2');
  assert.deepEqual(await syncNotionActivities(request('Notion')), []);
  assert.deepEqual(methods, ['POST', 'GET', 'POST', 'GET']);
});

test('sync permission error stays an error and does not fetch or erase the list', async t => {
  let calls = 0;
  mock(t, (_, options) => {
    calls++;
    return options.method === 'GET' ? json(ready) : json({ detail: '파일 접근 권한을 확인해주세요.' }, 403);
  });
  await assert.rejects(refresh(), /파일 접근 권한/);
  assert.equal(calls, 2);
});

test('activity read error is not treated as an empty result', async t => {
  mock(t, () => json({ detail: '조회 실패' }, 500));
  await assert.rejects(loadExternalActivities(request()), /조회 실패/);
});

test('Figma rejects an invalid continuation cursor', async t => {
  mock(t, (_, options) => options.method === 'GET' ? json(ready) : json({ source: 'figma', has_next: true, next_cursor: 'same' }));
  await assert.rejects(refresh('same'), /다음 수집 페이지/);
});

test('aborting after the status check prevents collecting', async t => {
  const controller = new AbortController();
  let calls = 0;
  mock(t, () => { calls++; controller.abort(); return json(ready); });
  await assert.rejects(refresh(null, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('malformed or cross-project responses are rejected', async t => {
  mock(t, () => json([{ ...item(1), project_id: 8 }]));
  await assert.rejects(loadExternalActivities(request()), /응답 형식/);
});

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
const { loadExternalActivities } = await import(moduleUrl(source));
const item = (id, source = 'figma', story_id = null) => ({ activity_id: id, project_id: 7, story_id,
  source, title: '수정 기록', description: '내용', source_url: 'https://example.com/resource', occurred_at: '2026-11-01T00:00:00' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
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

test('Figma finishes cursor sync before reading all activity pages, excluding organized items', async t => {
  const calls = [];
  mock(t, (url, options) => {
    calls.push([url, options.method]);
    if (calls.length === 1) return json({ source: 'figma', has_next: true, next_cursor: 'a/b?c' });
    if (calls.length === 2) {
      assert.match(url, /cursor=a%2Fb%3Fc$/);
      return json({ source: 'figma', has_next: false, next_cursor: null });
    }
    assert.match(url, /source=figma&unorganized=true&limit=100&offset=/);
    return json(calls.length === 3 ? Array.from({ length: 100 }, (_, i) => item(i)) : [item(100), item(101, 'figma', 2)]);
  });
  const result = await loadExternalActivities(request());
  assert.deepEqual(calls.map(call => call[1]), ['POST', 'POST', 'GET', 'GET']);
  assert.match(calls[3][0], /offset=100$/);
  assert.equal(result.length, 101);
  assert.equal(result[0].id, 'figma:0');
  assert.equal(result[0].before, '');
  assert.equal(result[0].reference, 'https://example.com/resource');
});

test('Notion successful empty sync still reads existing DB activities; repeat refresh replaces result', async t => {
  let count = 0;
  mock(t, (url, options) => {
    if (options.method === 'POST') return json({ source: 'notion', has_next: false, next_cursor: null, created: 0 });
    assert.match(url, /source=notion/);
    return json(count++ === 0 ? [item(2, 'notion')] : []);
  });
  assert.equal((await loadExternalActivities(request('Notion')))[0].id, 'notion:2');
  assert.deepEqual(await loadExternalActivities(request('Notion')), []);
});

test('sync permission error stays an error and does not fetch or erase the list', async t => {
  let calls = 0;
  mock(t, () => { calls++; return json({ detail: '파일 접근 권한을 확인해주세요.' }, 403); });
  await assert.rejects(loadExternalActivities(request()), /파일 접근 권한/);
  assert.equal(calls, 1);
});

test('activity read error is not treated as an empty result', async t => {
  mock(t, (_, options) => options.method === 'POST'
    ? json({ source: 'figma', has_next: false }) : json({ detail: '조회 실패' }, 500));
  await assert.rejects(loadExternalActivities(request()), /조회 실패/);
});

test('repeated cursor fails rather than looping forever', async t => {
  mock(t, () => json({ source: 'figma', has_next: true, next_cursor: 'same' }));
  await assert.rejects(loadExternalActivities(request()), /다음 수집 페이지/);
});

test('aborting after sync prevents subsequent list request', async t => {
  const controller = new AbortController();
  let calls = 0;
  mock(t, () => { calls++; controller.abort(); return json({ source: 'figma', has_next: false }); });
  await assert.rejects(loadExternalActivities(request('Figma', controller.signal)), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('malformed or cross-project responses are rejected', async t => {
  mock(t, (_, options) => options.method === 'POST'
    ? json({ source: 'figma', has_next: false }) : json([{ ...item(1), project_id: 8 }]));
  await assert.rejects(loadExternalActivities(request()), /응답 형식/);
});

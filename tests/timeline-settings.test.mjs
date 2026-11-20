import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
}
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const client = moduleUrl((await read('../src/api/client.ts')).replace('import.meta.env.DEV', 'true'));
const projects = moduleUrl((await read('../src/api/projects.ts'))
  .replace("'./client'", JSON.stringify(client))
  .replace("'./auth'", JSON.stringify(moduleUrl('export const getAccessToken = () => "test-token"')))
  .replace("'../data/github'", JSON.stringify(moduleUrl('export const githubRepository = () => null'))));
const timeline = moduleUrl((await read('../src/api/timeline.ts'))
  .replace("'./projects'", JSON.stringify(projects))
  .replace("'../data/projects'", JSON.stringify(moduleUrl('export const services = ["Figma", "GitHub", "Notion"]'))));
const { loadTimeline } = await import(timeline);
const { saveConnection, getConnections } = await import(projects);

test('timeline loads remaining pages, maps nullable fields and joins distinct sources by Story ID', async t => {
  const row = id => ({ id, title: '기록', content: '', created_at: '2026-11-01T01:02:03',
    story_status: 'published', ai_analysis: { tags: ['설계'], summary: '요약' } });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers.get('Authorization'), 'Bearer test-token');
    calls.push(url);
    const page = url.includes('/activities') ? [
      { story_id: 101, source: 'github' }, { story_id: 101, source: 'github' }, { story_id: 101, source: 'figma' },
    ] : url.endsWith('offset=0') ? Array.from({ length: 100 }, (_, i) => row(i + 1)) : [row(101)];
    return Response.json(page);
  });
  const stories = await loadTimeline('7', new AbortController().signal);
  assert.equal(calls.length, 3);
  assert.equal(stories.length, 101);
  assert.deepEqual(stories.at(-1).sources, ['GitHub', 'Figma']);
  assert.equal(stories[0].why, '');
  assert.equal(stories[0].status, '완료');
  assert.equal(stories[0].date, '2026.11.01');
  assert.deepEqual(stories[0].tags, ['설계']);
});

test('settings reads connections and sends null to disconnect a single service', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.method ?? 'GET', options.body && JSON.parse(options.body)]);
    assert.equal(options.headers.get('Authorization'), 'Bearer test-token');
    return Response.json({ project_id: 7, connections: [] });
  });
  await getConnections('7', new AbortController().signal);
  await saveConnection('7', 'Notion', null);
  assert.deepEqual(calls, [
    ['/backend/api/projects/7/connections', 'GET', undefined],
    ['/backend/api/projects/7/connections/notion', 'PATCH', { external_url: null }],
  ]);
});

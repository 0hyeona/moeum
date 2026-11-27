import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const client = moduleUrl((await read('../src/api/client.ts')).replaceAll('import.meta.env.DEV', 'true'));
const { ApiError } = await import(client);
const source = (await read('../src/api/activities.ts'))
  .replace("'./client'", JSON.stringify(client))
  .replace("'./projects'", JSON.stringify(moduleUrl('export const projectRequest = (...args) => globalThis.dashboardRequest(...args)')))
  .replace("'../data/github'", JSON.stringify(moduleUrl(await read('../src/data/github.ts'))))
  .replace("'../data/githubChanges'", JSON.stringify(moduleUrl(await read('../src/data/githubChanges.ts'))));
const { readGithubActivities, syncGithubActivities, refreshGithubActivities } = await import(moduleUrl(source));

test('an expired MOEUM session never falls back to another protected request', async t => {
  t.after(() => { delete globalThis.dashboardRequest; });
  let calls = 0;
  globalThis.dashboardRequest = async () => {
    calls++;
    throw new ApiError(401, { detail: '유효하지 않거나 만료된 로그인입니다.' });
  };
  await assert.rejects(refreshGithubActivities('7', 'https://github.com/team/repo', new AbortController().signal),
    error => error.status === 401);
  assert.equal(calls, 1);
});

test('GitHub credential expiry keeps saved records and asks for GitHub reconnection', async t => {
  t.after(() => { delete globalThis.dashboardRequest; });
  globalThis.dashboardRequest = async path => {
    if (path.includes('/github/branches')) throw new ApiError(409,
      { detail: 'GitHub 연결이 만료되었습니다.' }, new Headers({ 'X-Integration-Error': 'GITHUB_RECONNECT_REQUIRED' }));
    return [];
  };
  const result = await refreshGithubActivities('7', 'https://github.com/team/repo', new AbortController().signal);
  assert.equal(result.recovery, 'github-reconnect');
  assert.match(result.error, /GitHub 연결/);
});

test('rate-limited refresh still returns saved records with a visible warning', async t => {
  t.after(() => { delete globalThis.dashboardRequest; });
  const calls = [];
  globalThis.dashboardRequest = async path => {
    calls.push(path);
    if (path.includes('/github/branches')) throw new Error('GitHub 요청 한도를 초과했습니다.');
    return [{ activity_id: 42, project_id: 7, source: 'github', story_id: null,
      external_id: 'team/repo:abc1234', branch_name: 'main', title: 'Saved commit', description: null,
      occurred_at: '2026-11-25T10:00:00Z', source_url: 'https://github.com/team/repo/commit/abc1234' }];
  };
  const result = await refreshGithubActivities('7', 'https://github.com/team/repo', new AbortController().signal);
  assert.match(result.error, /요청 한도/);
  assert.equal(result.commits[0].sha, 'abc1234');
  assert.equal(result.changes[0].activityId, 42);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('/activities?'));
});

test('canceled refresh never starts another stored-record request', async t => {
  t.after(() => { delete globalThis.dashboardRequest; });
  const controller = new AbortController();
  let calls = 0;
  globalThis.dashboardRequest = async () => { calls++; controller.abort(); throw new DOMException('Canceled', 'AbortError'); };
  await assert.rejects(refreshGithubActivities('7', 'https://github.com/team/repo', controller.signal), { name:'AbortError' });
  assert.equal(calls, 1);
});

test('dashboard reads only stored activities and keeps organized commits out of the pending count', async t => {
  t.after(() => { delete globalThis.dashboardRequest; });
  globalThis.dashboardRequest = async (path, options) => {
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(path, '/api/projects/7/activities?source=github&limit=100&offset=0');
    const row = { project_id: 7, source: 'github', occurred_at: '2026-11-20T10:00:00', title: 'update',
      story_id: null, branch_name: 'main', external_id: 'team/repo:abc1234' };
    return [row, { ...row, external_id: 'team/repo:abcdef1', story_id: 8 }, { ...row, external_id: 'old/repo:abc1234' }];
  };
  const { changes, commits } = await readGithubActivities('7', 'https://github.com/team/repo', new AbortController().signal);
  assert.equal(commits.length, 2);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, 'github:team/repo:abc1234');
});

test('manual refresh imports branches and follows sync pagination using only project endpoints', async t => {
  t.after(() => { delete globalThis.dashboardRequest; });
  const calls = [];
  globalThis.dashboardRequest = async (path, options) => {
    calls.push([options.method ?? 'GET', path]);
    if (path.includes('/branches?')) return { items: [{ name: 'feat/ui' }], has_next: false };
    return { has_next: new URL(path, 'https://test.invalid').searchParams.get('page') === '1' };
  };
  await syncGithubActivities('7', new AbortController().signal);
  assert.deepEqual(calls, [
    ['GET', '/api/projects/7/github/branches?page=1&per_page=100'],
    ['POST', '/api/projects/7/github/sync?branch=feat%2Fui&page=1&per_page=100'],
    ['POST', '/api/projects/7/github/sync?branch=feat%2Fui&page=2&per_page=100'],
  ]);
});

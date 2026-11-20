import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const source = (await read('../src/api/activities.ts'))
  .replace("'./projects'", JSON.stringify(moduleUrl('export const projectRequest = (...args) => globalThis.dashboardRequest(...args)')))
  .replace("'../data/github'", JSON.stringify(moduleUrl(await read('../src/data/github.ts'))))
  .replace("'../data/githubChanges'", JSON.stringify(moduleUrl(await read('../src/data/githubChanges.ts'))));
const { readGithubActivities, syncGithubActivities } = await import(moduleUrl(source));

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

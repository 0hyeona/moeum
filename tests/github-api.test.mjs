import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const helper = moduleUrl(await readFile(new URL('../src/data/github.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/api/github.ts', import.meta.url), 'utf8')).replace("'../data/github'", JSON.stringify(helper));
const { loadGitHubRepository, loadGitHubCommits, loadGitHubChangeCommits } = await import(moduleUrl(source));
const signal = () => new AbortController().signal;
const url = 'https://github.com/team/repo';
const commit = { sha: 'abcdef012345', commit: { message: 'fix: actual change\nDetails', committer: { date: '2026-10-28T00:00:00Z' }, author: null }, parents: [{ sha: 'parent1' }] };
function mock(t, handler) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => handler(String(url), options);
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('loads every branch page and puts the real default branch first; sends no credentials', async t => {
  let requests = 0;
  mock(t, (path, options) => {
    requests++;
    assert.equal(options.credentials, 'omit');
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    if (!path.includes('/branches')) return json({ default_branch: 'trunk' });
    return path.includes('&page=1') ? json(Array.from({ length: 100 }, (_, i) => ({ name: `feature/${i}` }))) : json([{ name: 'trunk' }]);
  });
  const result = await loadGitHubRepository(url, signal());
  assert.equal(result.branches[0], 'trunk');
  assert.equal(result.branches.length, 101);
  assert.equal(requests, 3);
});

test('encodes branch names and fetches actual line counts and merge parents', async t => {
  mock(t, path => {
    if (path.includes('?')) {
      assert.match(path, /sha=feature%2Flogin&per_page=5$/);
      return json([{ ...commit, parents: [{ sha: 'a' }, { sha: 'b' }] }]);
    }
    return json({ ...commit, stats: { additions: 28, deletions: 3 } });
  });
  const [result] = await loadGitHubCommits(url, 'feature/login', signal());
  assert.equal(result.additions, 28);
  assert.equal(result.deletions, 3);
  assert.equal(result.merged, true);
  assert.equal(result.message, commit.commit.message);
});

test('keeps commits and marks unavailable counts as null after a detail failure', async t => {
  mock(t, path => path.includes('?') ? json([commit]) : json({}, 403));
  const [result] = await loadGitHubCommits(url, 'main', signal());
  assert.equal(result.sha, commit.sha);
  assert.equal(result.additions, null);
  assert.equal(result.deletions, null);
});

test('an empty GitHub repository is an empty result, not a network error', async t => {
  mock(t, () => json({}, 409));
  assert.deepEqual(await loadGitHubCommits(url, 'main', signal()), []);
});

test('private or missing repositories display an actionable error', async t => {
  mock(t, () => json({}, 404));
  await assert.rejects(loadGitHubRepository(url, signal()), /비공개 저장소/);
});

test('rate limits do not masquerade as an empty list', async t => {
  mock(t, () => json({}, 429));
  await assert.rejects(loadGitHubCommits(url, 'main', signal()), /요청 한도/);
});

test('invalid or missing URLs never make a request', async t => {
  mock(t, () => { throw new Error('must not fetch'); });
  await assert.rejects(loadGitHubRepository('', signal()), /URL/);
  await assert.rejects(loadGitHubRepository('https://github.com/team', signal()), /URL/);
});

test('aborted requests propagate cancellation instead of returning stale commits', async t => {
  const controller = new AbortController();
  mock(t, path => {
    if (path.includes('?')) return json([commit]);
    controller.abort();
    throw new DOMException('Aborted', 'AbortError');
  });
  await assert.rejects(loadGitHubCommits(url, 'main', controller.signal), { name: 'AbortError' });
});

test('network failures give a retry message', async t => {
  mock(t, () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(loadGitHubRepository(url, signal()), /인터넷 연결/);
});

// Render the disconnected state without a backend or GitHub account.
test('disconnected dashboard offers settings without a table, filters, or fetches', async t => {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const require = createRequire(import.meta.url);
  const resolve = name => pathToFileURL(require.resolve(name)).href;
  const React = await import('react');
  const { MemoryRouter } = await import('react-router');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const styles = moduleUrl('export default new Proxy({}, { get: (_, name) => String(name) });');
  const ui = moduleUrl('export const Badge = () => null; export const ServiceIcon = () => null;');
  let component = await readFile(new URL('../src/components/GitHubActivity.tsx', import.meta.url), 'utf8');
  component = component.replace("'../api/github'", JSON.stringify(moduleUrl(source)))
    .replace("'./ui'", JSON.stringify(ui))
    .replace("'./ui.module.css'", JSON.stringify(styles))
    .replace("'../pages/DashboardPage.module.css'", JSON.stringify(styles));
  let compiled = ts.transpileModule(component, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const name of ['react', 'react-router', 'react/jsx-runtime']) {
    compiled = compiled.replaceAll(JSON.stringify(name), JSON.stringify(resolve(name))).replaceAll(`'${name}'`, JSON.stringify(resolve(name)));
  }
  const { GitHubActivity } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  mock(t, () => { throw new Error('must not fetch'); });
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(GitHubActivity, { url: '' })));
  assert.match(html, /GitHub 저장소를 연결해보세요/);
  assert.match(html, /설정에서 연결하기/);
  assert.match(html, /\/settings#settings-url-GitHub/);
  assert.doesNotMatch(html, /<table|브랜치 필터|새로고침/);
  const loading = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(GitHubActivity, { url })));
  assert.match(loading, /GitHub 기록을 불러오는 중/);
  assert.doesNotMatch(loading, /설정에서 연결하기|<table/);
});

test('pending changes include paginated branch history, with shared commits counted once', async t => {
  mock(t, path => {
    const parsed = new URL(path);
    const branch = parsed.searchParams.get('sha');
    const page = parsed.searchParams.get('page');
    assert.equal(parsed.searchParams.get('per_page'), '100');
    if (branch === 'main' && page === '1') return json(Array.from({ length: 100 }, (_, i) => ({ ...commit, sha: `sha${i}` })));
    if (branch === 'main') return json([{ ...commit, sha: 'older' }]);
    return json([{ ...commit, sha: 'sha0' }, { ...commit, sha: 'feature-only' }]);
  });
  const changes = await loadGitHubChangeCommits(url, ['main', 'feature/login'], signal());
  assert.equal(changes.length, 102);
  assert.ok(changes.some(change => change.sha === 'older'));
  assert.ok(changes.some(change => change.sha === 'feature-only'));
});

test('organized commits stay excluded after refresh and other services remain intact', async () => {
  const { githubChanges, replaceGithubChanges } = await import(moduleUrl(await readFile(new URL('../src/data/githubChanges.ts', import.meta.url), 'utf8')));
  const incoming = githubChanges('team/repo', [{ sha: 'fullsha', message: 'Actual change', date: '2026-10-28T00:00:00Z', merged: false, additions: null, deletions: null }], new Date('2026-10-28T12:00:00Z'));
  assert.equal(incoming[0].daysAgo, 0);
  const figma = { id: 'figma1', service: 'Figma' };
  const project = { changes: [figma], stories: [] };
  const fetched = replaceGithubChanges(project, [...incoming, ...incoming]);
  assert.equal(fetched.changes.length, 2);
  assert.equal(fetched.changes.filter(change => change.service === 'GitHub').length, 1);
  const organized = { ...fetched, stories: [{ sourceChangeIds: [incoming[0].id] }] };
  assert.deepEqual(replaceGithubChanges(organized, incoming).changes, [figma]);
  assert.deepEqual(replaceGithubChanges(fetched, []).changes, [figma]);
  assert.notEqual(githubChanges('other/repo', [{ sha: 'fullsha', message: '', date: null, merged: false }])[0].id, incoming[0].id);
});

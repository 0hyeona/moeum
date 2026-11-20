import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const data = moduleUrl(await readFile(new URL('../src/data/projects.ts', import.meta.url), 'utf8'));
const activity = moduleUrl(await readFile(new URL('../src/data/activity.ts', import.meta.url), 'utf8'));
const client = moduleUrl((await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')).replaceAll('import.meta.env.DEV', 'true'));
const auth = moduleUrl('export const getAccessToken = () => "test-access-token";');
const source = (await readFile(new URL('../src/api/stories.ts', import.meta.url), 'utf8'))
  .replace("'./client'", JSON.stringify(client)).replace("'./auth'", JSON.stringify(auth)).replace("'../data/projects'", JSON.stringify(data));
const api = await import(moduleUrl(source));
const external = moduleUrl((await readFile(new URL('../src/api/externalActivities.ts', import.meta.url), 'utf8'))
  .replace("'./client'", JSON.stringify(client)).replace("'./auth'", JSON.stringify(auth)).replace("'../data/activity'", JSON.stringify(activity)));
const github = await import(moduleUrl((await readFile(new URL('../src/api/githubActivities.ts', import.meta.url), 'utf8'))
  .replace("'./client'", JSON.stringify(client)).replace("'./auth'", JSON.stringify(auth)).replace("'./externalActivities'", JSON.stringify(external))));
const { emptyStoryFields } = await import(data);
const row = (overrides = {}) => ({ id: 12, project_id: 7, title: '제목', content: 'legacy content', story_status: 'draft',
  created_at: '2026-11-18T01:00:00Z', updated_at: '2026-11-18T01:00:00Z', ...overrides });
const link = (activity_id = 101, story_id = 12, source = 'figma') => ({ activity_id, project_id: 7, story_id, source, title: '변경사항', occurred_at: '2026-11-18T01:00:00Z' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function mock(t, handler) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer test-access-token');
    return handler(String(url), options);
  };
}
test('draft creation uses server activity IDs and restores memo and analysis after a fresh GET', async t => {
  let stored;
  mock(t, (url, options) => {
    if (options.method === 'POST') {
      assert.equal(url, '/backend/stories');
      const body = JSON.parse(options.body);
      assert.equal(body.story_status, 'draft');
      assert.deepEqual(body.activity_ids, [101]);
      assert.equal(body.project_id, 7);
      assert.equal(body.next_steps, '다음 단계');
      assert.equal(body.ai_analysis.moeum_editor.memo, '내 메모');
      assert.equal('memo' in body, false);
      assert.equal('next' in body, false);
      stored = row(body);
      return json(stored, 201);
    }
    return json(url.includes('/activities?') ? [link()] : stored);
  });
  const fields = { ...emptyStoryFields, title: '제목', memo: '내 메모', next: '다음 단계', summary: '요약', tags: ['UI'] };
  const created = await api.createStory('7', fields, [{ id: 'figma:101', activityId: 101, service: 'Figma' }]);
  const restored = await api.getStory(created.id);
  assert.equal(restored.memo, fields.memo);
  assert.equal(restored.next, fields.next);
  assert.deepEqual(restored.tags, ['UI']);
  assert.deepEqual(restored.sourceChangeIds, ['figma:101']);
  assert.deepEqual(restored.sources, ['Figma']);
});
test('partial updates preserve unknown metadata, explicit empty edits and published status', async t => {
  const previous = api.toStory(row({ story_status: 'published', ai_analysis: { summary: 'AI text', vendor: { x: 1 }, moeum_editor: { memo: 'old', custom: 3 } } }));
  mock(t, (_, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.why, '');
    assert.equal('content' in body, false);
    assert.equal('story_status' in body, false);
    assert.deepEqual(body.ai_analysis.vendor, { x: 1 });
    assert.equal(body.ai_analysis.moeum_editor.custom, 3);
    assert.equal(body.ai_analysis.moeum_editor.memo, '');
    assert.equal(body.ai_analysis.summary, '');
    return json(row({ ...body, story_status: 'published' }));
  });
  const updated = await api.updateStory(previous, { why: '', memo: '', summary: '' });
  assert.equal(updated.status, '완료');
  assert.equal(updated.summary, '');
});
test('completion PATCH uses published, never an invented complete endpoint', async t => {
  mock(t, (url, options) => {
    assert.equal(url, '/backend/stories/12');
    assert.equal(options.method, 'PATCH');
    const body = JSON.parse(options.body);
    assert.equal(body.story_status, 'published');
    return json(row(body));
  });
  assert.equal((await api.updateStory(api.toStory(row()), { title: '완료' }, 'published')).status, '완료');
});
test('list paginates and restores service filters from server links', async t => {
  mock(t, url => {
    if (url.includes('/activities?')) return json([link(101, 101, 'github')]);
    return json(url.endsWith('offset=0') ? Array.from({ length: 100 }, (_, i) => row({ id: i + 1 })) : [row({ id: 101 })]);
  });
  const list = await api.listStories('7');
  assert.equal(list.length, 101);
  assert.deepEqual(list[100].sources, ['GitHub']);
});
test('HTTP errors stay errors and a 204 delete needs no JSON body', async t => {
  mock(t, (_, options) => options.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ detail: '이미 연결된 변경사항' }, 409));
  await assert.rejects(api.createStory('7', { ...emptyStoryFields, title: '제목' }, []), error => error.status === 409);
  await api.deleteStory('12');
});
test('invalid IDs, too many selections and invalid fields never reach the network', async t => {
  mock(t, () => assert.fail('Unexpected request'));
  assert.throws(() => api.activityIds([{ id: 'github:owner/repo:sha' }], true), /서버에 저장/);
  assert.throws(() => api.activityIds(Array.from({ length: 21 }, (_, i) => ({ activityId: i + 1 })), true), /1~20/);
  assert.throws(() => api.storyPatch({ title: '  ' }), /제목/);
  assert.throws(() => api.storyPatch({ tags: ['a'.repeat(41)] }), /태그/);
  await assert.rejects(api.getStory('../2'), /유효한/);
});
test('malformed and wrong-project responses are rejected', async t => {
  mock(t, () => json([row({ project_id: 8 })]));
  await assert.rejects(api.listStories('7'), /응답 형식/);
});
test('analysis sends the selected mode and propagates server failures', async t => {
  let attempt = 0;
  mock(t, (url, options) => {
    assert.equal(url, '/backend/stories/analyze');
    assert.deepEqual(JSON.parse(options.body), { project_id: 7, activity_ids: [101], mode: 'semantic' });
    return attempt++ ? json({ detail: 'AI 분석 설정 필요' }, 503) : json({ title: 'AI 제목', summary: '요약', tags: ['UI'], before: null, after: '개선' });
  });
  const selected = [{ activityId: 101 }];
  assert.equal((await api.analyzeActivities('7', selected)).title, 'AI 제목');
  await assert.rejects(api.analyzeActivities('7', selected), error => error.status === 503);
});
test('all three analysis modes are transmitted without changing selected activity IDs', async t => {
  for (const [label, expected] of [['의미 중심', 'semantic'], ['균형', 'balanced'], ['코드 상세', 'code']]) {
    mock(t, (_, options) => {
      assert.deepEqual(JSON.parse(options.body), { project_id: 7, activity_ids: [101], mode: expected });
      return json({ title: '분석', summary: '기록 요약', tags: ['github'], before: null, after: null });
    });
    const result = await api.analyzeActivities('7', [{ activityId: 101 }], undefined, label);
    assert.equal(result.summary, '기록 요약');
  }
});
test('GitHub sync walks branches and pages before returning DB activity IDs', async t => {
  const calls = [];
  mock(t, (url, options) => {
    calls.push([url, options.method]);
    const query = new URL(url, 'http://test').searchParams;
    const page = Number(query.get('page'));
    if (url.includes('/branches?')) return json({ page, has_next: page === 1, items: [{ name: page === 1 ? 'main' : 'feature/a' }] });
    if (url.includes('/sync?')) return json({ page, has_next: query.get('branch') === 'main' && page === 1 });
    return json([link(111, null, 'github')]);
  });
  const result = await github.syncGithubActivities({ projectId: '7', signal: new AbortController().signal });
  assert.equal(calls.length, 6);
  assert.equal(calls.filter(([, method]) => method === 'POST').length, 3);
  assert.equal(result[0].activityId, 111);
  assert.equal(result[0].id, 'github:111');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = ts.transpileModule(await readFile(new URL('../src/pages/changesPresentation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { newestChanges, changeDescription, notionDetails } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const base = { title: '제목', description: '', daysAgo: 0, service: 'Notion' };

test('interleaves services by exact timestamp without mutating the project list', () => {
  const input = [
    { ...base, id: 'github', service: 'GitHub', occurredAt: '2026-11-20T01:00:00Z' },
    { ...base, id: 'notion', occurredAt: '2026-11-20T12:39:00Z' },
    { ...base, id: 'figma', service: 'Figma', occurredAt: '2026-11-20T12:38:00Z' },
    { ...base, id: 'unknown', daysAgo: Infinity },
  ];
  assert.deepEqual(newestChanges(input).map(c => c.id), ['notion', 'figma', 'github', 'unknown']);
  assert.equal(input[0].id, 'github');
});

test('commit title is shown once while the multiline body is preserved', () => {
  assert.equal(changeDescription({ ...base, service: 'GitHub', description: '제목\n\n세부 작업\n추가 설명' }), '세부 작업\n추가 설명');
  assert.equal(changeDescription({ ...base, service: 'GitHub', description: '제목' }), '');
});

test('Notion preserves actual before/after text and explains missing content', () => {
  assert.deepEqual(notionDetails({ ...base, description: '변경 전:\n기존 문장\n\n변경 후:\n새 문장\n두 번째 줄\n\n두 수집 시점 사이의 차이입니다.' }), [
    { label: '변경 전', content: '기존 문장' }, { label: '변경 후', content: '새 문장\n두 번째 줄' },
  ]);
  assert.equal(notionDetails({ ...base, description: '추가된 내용: gd' })[0].content, 'gd');
  assert.match(notionDetails({ ...base, description: '추가된 내용:\n\n두 수집 시점 사이의 차이입니다.' })[0].content, /상세 내용이 제공되지/);
});

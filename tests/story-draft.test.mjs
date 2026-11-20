import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const urlFor = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const compile = async path => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const projectsUrl = urlFor(await compile('../src/data/projects.ts'));
const code = (await compile('../src/data/storyDraft.ts')).replace("'./projects'", JSON.stringify(projectsUrl));
const { storyDraftFromAnalysis } = await import(urlFor(code));

test('new draft contains actual editable AI text and leaves personal reflections empty', () => {
  const result = storyDraftFromAnalysis({ title: '제목', summary: '수정 내역', before: '기존 코드', after: '새 코드', tags: ['UI'] });
  assert.equal(result.title, '제목');
  assert.equal(result.solution, '수정 내역');
  assert.equal(result.problem, '변경 전 기록\n기존 코드');
  assert.equal(result.result, '변경 후 기록\n새 코드');
  assert.equal(result.why, '');
  assert.equal(result.learned, '');
  assert.equal(result.memo, '');
  assert.equal(result.next, '');
});

test('missing analysis creates blank fields without invented recommendations', () => {
  const result = storyDraftFromAnalysis(null);
  for (const key of ['title', 'problem', 'solution', 'result']) assert.equal(result[key], '');
});

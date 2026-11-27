import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const projects = moduleUrl(await readFile(new URL('../src/data/projects.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/data/analysisDraft.ts', import.meta.url), 'utf8')).replace("'./projects'", JSON.stringify(projects));
const { readAnalysisDraft, saveAnalysisDraft, removeAnalysisDraft } = await import(moduleUrl(source));
const draft = { projectId: '7', changeIds: ['figma:101'], mode: '의미 중심', tags: ['수정'], title: '직접 수정한 제목', before: '전', after: '후', summary: '수정한 내용' };
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined });

function storage(t) {
  const entries = new Map();
  mockStorage(t, { getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) });
  return entries;
}

function mockStorage(t, value) {
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = value;
  t.after(() => { globalThis.sessionStorage = previous; });
}

test('analysis recovery and removal are isolated by account and project', t => {
  storage(t);
  assert.equal(saveAnalysisDraft(1, draft), true);
  assert.equal(saveAnalysisDraft(1, { ...draft, projectId: '8', title: '다른 프로젝트' }), true);
  assert.equal(saveAnalysisDraft(2, { ...draft, title: '다른 계정' }), true);
  assert.deepEqual(readAnalysisDraft(1, '7'), draft);
  removeAnalysisDraft(1, '7');
  assert.equal(readAnalysisDraft(1, '7'), null);
  assert.equal(readAnalysisDraft(1, '8').title, '다른 프로젝트');
  assert.equal(readAnalysisDraft(2, '7').title, '다른 계정');
});

test('corrupt, mismatched or incomplete saved data cannot become an analysis', t => {
  const entries = storage(t);
  for (const value of ['{invalid', 'null', JSON.stringify({ ...draft, projectId: '8' }),
    JSON.stringify({ ...draft, tags: [null] }), JSON.stringify({ ...draft, changeIds: [] }),
    JSON.stringify({ ...draft, mode: 'unknown' }), JSON.stringify({ ...draft, title: null })]) {
    entries.set('moeum.analysis-draft.1.7', value);
    assert.equal(readAnalysisDraft(1, '7'), null);
  }
});

test('blocked or full storage returns a save failure so the UI can protect unsaved edits', t => {
  mockStorage(t, {
    getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); },
  });
  assert.equal(readAnalysisDraft(1, '7'), null);
  assert.equal(saveAnalysisDraft(1, draft), false);
  assert.doesNotThrow(() => removeAnalysisDraft(1, '7'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = ts.transpileModule(await readFile(new URL('../src/data/activity.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { toChange, replaceServiceChanges } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
test('different services cannot collide; missing dates and comparisons are not invented', () => {
  const figma = toChange({ id: '7', service: 'Figma', title: 'Design' });
  const notion = toChange({ id: '7', service: 'Notion', title: 'Document', occurredAt: 'invalid' });
  assert.notEqual(figma.id, notion.id);
  assert.equal(notion.daysAgo, Infinity);
  assert.equal(figma.before, '');
  assert.equal(figma.after, '');
});
test('refresh preserves other services, deduplicates and excludes organized activities', () => {
  const figma = toChange({ id: '1', service: 'Figma', title: 'Design' });
  const notion = toChange({ id: '2', service: 'Notion', title: 'Doc' });
  const next = toChange({ id: '3', service: 'Figma', title: 'Next' });
  const project = { changes: [figma, notion], stories: [{ sourceChangeIds: [figma.id] }] };
  assert.deepEqual(replaceServiceChanges(project, 'Figma', [figma, next, next, notion]).changes, [notion, next]);
  assert.deepEqual(replaceServiceChanges(project, 'Figma', []).changes, [notion]);
});

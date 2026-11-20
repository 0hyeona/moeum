import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = ts.transpileModule(await readFile(new URL('../src/data/notionConnectionState.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { needsNotionConnection } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('missing account and page permissions show a connection action', () => {
  assert.equal(needsNotionConnection({ status: 'disconnected' }), true);
  for (const error of ['Notion 계정 연결이 필요합니다.', 'Notion 페이지 접근 권한을 확인해주세요.', 'Notion 재연결이 필요합니다.']) {
    assert.equal(needsNotionConnection({ status: 'error', error }), true, error);
  }
});

test('server, rate limit, and network errors are not presented as missing authorization', () => {
  for (const error of ['Notion 요청 한도를 초과했습니다.', 'Notion 서버 오류', '네트워크 연결을 확인해주세요.']) {
    assert.equal(needsNotionConnection({ status: 'error', error }), false, error);
  }
  assert.equal(needsNotionConnection({ status: 'ready' }), false);
});

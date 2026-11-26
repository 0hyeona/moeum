import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('../src/data/figmaChanges.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { formatFigmaDescription, completeFigmaAnalysis } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const font = characters => JSON.stringify({ fontName: { family: 'Inter', style: 'Regular' }, fontSize: 16,
  segments: [{ characters, start: 0, end: characters.length, fontName: { family: 'Inter', style: 'Regular' }, fontSize: 16 }] });
const description = `마지막 전송과 비교한 변경 내용\n요소 추가 0개 · 삭제 0개 · 수정 2개\n\n페이지 / 버튼 문구\n텍스트: 저장 → 저장 완료\n글꼴 스타일: ${font('저장')} → ${font('저장 완료')}\n\n페이지 / 버튼 배경\n모서리: 8 → 12\n\n비교 기준: 플러그인이 마지막으로 전송한 상태.`;
const change = { service: 'Figma', title: '버튼 변경', description, before: '', after: '' };
const missing = { summary: '서버 요약', before: '', after: '' };

test('missing Figma comparisons use actual recorded text and shape values', () => {
  const result = completeFigmaAnalysis(missing, [change]);
  assert.match(result.before, /페이지 \/ 버튼 문구\n텍스트: 저장/);
  assert.match(result.after, /텍스트: 저장 완료/);
  assert.match(result.before, /모서리: 8/);
  assert.match(result.after, /모서리: 12/);
  assert.equal(result.summary, '서버 요약');
  assert.equal(missing.before, '');
});

test('readable font styles keep actual mixed-range values without serialized JSON', () => {
  const oldStyle = { segments: [{ start: 0, end: 2, fontSize: 16 }, { start: 2, end: 4, fontSize: 20 }] };
  const newStyle = { segments: [{ start: 0, end: 2, fontSize: 18 }, { start: 2, end: 4, fontSize: 20 }] };
  const result = formatFigmaDescription(`글꼴 스타일: ${JSON.stringify(oldStyle)} → ${JSON.stringify(newStyle)}`);
  assert.match(result, /0–2: 크기 16/);
  assert.match(result, /0–2: 크기 18/);
  assert.match(result, /2–4: 크기 20/);
  assert.doesNotMatch(result, /segments|fontSize|[{}]/);
});

test('only the contaminated record-based fallback is rebuilt from complete records', () => {
  const result = completeFigmaAnalysis({ ...missing, summary: '글꼴 스타일: {"fontName": …\n저장된 작업 기록을 정리한 자체 분석이에요.' }, [change]);
  assert.match(result.summary, /텍스트: 저장 → 저장 완료/);
  assert.match(result.summary, /모서리: 8 → 12/);
  assert.match(result.summary, /Inter Regular/);
  assert.doesNotMatch(result.summary, /fontName|segments|자체 분석/);
  const provided = { summary: '작성자가 확인한 요약', before: '서버가 제공한 Before', after: '서버가 제공한 After' };
  assert.deepEqual(completeFigmaAnalysis(provided, [change]), provided);
});

test('missing data and ambiguous arrows never invent a before or after', () => {
  for (const description of ['요소 1개 수정', '텍스트: 첫 값 → 중간 값 → 최종 값', '텍스트: 삭제 → ', '글꼴 스타일: {"fontSize":16 → {"fontSize":20}']) {
    const result = completeFigmaAnalysis(missing, [{ ...change, description }]);
    assert.equal(result.before, '');
    assert.equal(result.after, '');
  }
});

test('arrows inside JSON text are preserved and do not split a comparison', () => {
  const result = formatFigmaDescription(`글꼴 스타일: ${font('이전 → 다음')} → ${font('저장')}`);
  assert.match(result, /Inter Regular/);
  assert.doesNotMatch(result, /fontName/);
});

test('mixed-service analysis preserves its summary and scopes supplemental values to Figma', () => {
  const result = completeFigmaAnalysis(missing, [change, { ...change, service: 'GitHub', description: '커밋 메시지' }]);
  assert.equal(result.summary, '서버 요약');
  assert.match(result.before, /^Figma · 버튼 변경/);
  assert.doesNotMatch(result.before, /커밋 메시지/);
});

test('structured comparisons take precedence and generated fields fit Story limits', () => {
  const result = completeFigmaAnalysis(missing, [{ ...change, before: '기존 내용', after: '가'.repeat(5000) }]);
  assert.match(result.before, /기존 내용/);
  assert.doesNotMatch(result.before, /모서리/);
  assert.ok(Array.from(result.after).length <= 3000);
  assert.match(result.after, /이하 생략/);
});

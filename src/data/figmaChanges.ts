import type { Change } from './projects';

type Comparison = { context: string; label: string; before: string; after: string };
type AnalysisText = { summary: string; before: string; after: string };
const names: Record<string, string> = {
  fontName: '글꼴', fontSize: '크기', family: '글꼴', style: '스타일',
  textCase: '대소문자', textDecoration: '장식', letterSpacing: '자간', lineHeight: '행간',
  textAlignHorizontal: '가로 정렬', textAlignVertical: '세로 정렬',
  paragraphSpacing: '문단 간격', paragraphIndent: '들여쓰기',
  fills: '채우기', type: '유형', color: '색상', opacity: '불투명도',
  unit: '단위', value: '값', segments: '텍스트 구간',
};

function readable(value: unknown): string {
  if (value === null) return '없음';
  if (Array.isArray(value)) return value.map(readable).join(' / ');
  if (typeof value !== 'object') return String(value);
  const object = value as Record<string, unknown>;
  if (typeof object.family === 'string' && typeof object.style === 'string') return `${object.family} ${object.style}`;
  const range = typeof object.start === 'number' && typeof object.end === 'number' ? `${object.start}–${object.end}: ` : '';
  return range + Object.entries(object)
    .filter(([key]) => !['characters', 'start', 'end'].includes(key))
    .map(([key, item]) => `${names[key] ?? key} ${readable(item)}`).join(' · ');
}

function readableValue(value: string): string {
  if (!/^[\[{]/.test(value)) return value;
  try { return readable(JSON.parse(value)); }
  catch { return value; }
}

// Arrows inside a text value or JSON object are not a comparison delimiter.
function splitComparison(value: string): [string, string] | null {
  let depth = 0, quoted = false, escaped = false;
  const positions: number[] = [];
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === '\\') { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === '{' || char === '[') depth++;
    if (char === '}' || char === ']') depth--;
    if (depth === 0 && value.startsWith(' → ', index)) positions.push(index);
  }
  if (positions.length !== 1 || depth !== 0 || quoted) return null;
  const position = positions[0];
  const before = value.slice(0, position).trim(), after = value.slice(position + 3).trim();
  return before && after ? [before, after] : null;
}

function figmaLines(description: string) {
  let context = '';
  const comparisons: Comparison[] = [];
  const lines = description.split('\n').map(line => {
    const match = /^([^:\n]{1,40}):\s*(.*)$/.exec(line);
    const pair = match && splitComparison(match[2]);
    if (match && pair) {
      const before = readableValue(pair[0]), after = readableValue(pair[1]);
      comparisons.push({ context, label: match[1], before, after });
      return `${match[1]}: ${before} → ${after}`;
    }
    if (line.trim() && !match && !/^(마지막 전송|요소 추가)/.test(line)) context = line.trim();
    return line;
  });
  return { comparisons, description: lines.join('\n').trim() };
}

export function formatFigmaDescription(description: string): string {
  return figmaLines(description).description;
}

function limited(value: string) {
  const characters = Array.from(value);
  return characters.length <= 3000 ? value : characters.slice(0, 2989).join('') + '\n… (이하 생략)';
}

// Fill only missing API fields from recorded values. Never infer intent or results.
export function completeFigmaAnalysis<T extends AnalysisText>(analysis: T, changes: Change[]): T {
  const figma = changes.filter(change => change.service === 'Figma');
  if (!figma.length) return analysis;
  const before: string[] = [], after: string[] = [];
  for (const change of figma) {
    const comparisons = figmaLines(change.description).comparisons;
    for (const side of ['before', 'after'] as const) {
      const recorded = change[side]?.trim() || comparisons.map(item =>
        `${item.context ? item.context + '\n' : ''}${item.label}: ${item[side]}`).join('\n\n');
      if (recorded) (side === 'before' ? before : after).push(`Figma · ${change.title}\n${recorded}`);
    }
  }
  // The backend's record-based fallback may truncate a font JSON object mid-line.
  // Rebuild that fallback from complete selected records, preserving AI summaries.
  const fallback = figma.length === changes.length && analysis.summary.includes('자체 분석이에요.')
    && /글꼴 스타일:\s*\{/.test(analysis.summary);
  return {
    ...analysis,
    before: analysis.before.trim() ? analysis.before : limited(before.join('\n\n')),
    after: analysis.after.trim() ? analysis.after : limited(after.join('\n\n')),
    summary: fallback ? limited(figma.map(change => `Figma · ${change.title}\n${formatFigmaDescription(change.description)}`).join('\n\n')) : analysis.summary,
  };
}

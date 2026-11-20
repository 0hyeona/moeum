import type { Change } from '../data/projects';

export function newestChanges(changes: Change[]): Change[] {
  const now = Date.now();
  const time = (change: Change) => {
    const timestamp = Date.parse(change.occurredAt ?? '');
    return Number.isFinite(timestamp) ? timestamp : Number.isFinite(change.daysAgo) ? now - change.daysAgo * 86400000 : -Infinity;
  };
  return [...changes].sort((a, b) => time(b) - time(a));
}

export function changeDescription(change: Change) {
  const description = change.description.trim();
  if (change.service === 'GitHub') {
    const lines = description.split('\n');
    if (lines[0]?.trim() === change.title.trim()) lines.shift();
    return lines.join('\n').trim();
  }
  if (change.service === 'Notion') {
    return description.replace(/(?:\n\s*)?두 수집 시점 사이의 차이입니다\.?\s*$/, '').trim();
  }
  return description === change.title.trim() ? '' : description;
}

export function notionDetails(change: Change) {
  const text = changeDescription(change);
  const sections = [...text.matchAll(/(?:^|\n)(추가된 내용|삭제된 내용|변경 전|변경 후):[ \t]*\n?/g)];
  if (!sections.length) return [{ label: '변경 내용', content: text || '수집된 기록에 상세 내용이 없어요.' }];
  return sections.map((match, index) => ({
    label: match[1],
    content: text.slice(match.index! + match[0].length, sections[index + 1]?.index ?? text.length).trim()
      || '텍스트가 없는 블록이거나 상세 내용이 제공되지 않았어요.',
  }));
}

export function selectedChangePreview(change: Change): Change {
  return change.service === 'Notion' ? { ...change, reference: '', labels: [] } : change;
}

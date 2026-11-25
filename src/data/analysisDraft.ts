import { analysisModes, type Analysis } from './projects';

const key = (userId: number, projectId: string) => `moeum.analysis-draft.${userId}.${projectId}`;

export function readAnalysisDraft(userId: number, projectId: string): Analysis | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(userId, projectId)) ?? 'null');
    if (!value || value.projectId !== projectId || !analysisModes.includes(value.mode)
      || !Array.isArray(value.changeIds) || !value.changeIds.length || value.changeIds.length > 20
      || !value.changeIds.every((id: unknown) => typeof id === 'string')
      || !Array.isArray(value.tags) || !value.tags.every((tag: unknown) => typeof tag === 'string')
      || !['title', 'before', 'after', 'summary'].every(field => typeof value[field] === 'string')) return null;
    return value;
  } catch { return null; }
}

export function saveAnalysisDraft(userId: number, analysis: Analysis): boolean {
  if (!analysis.projectId) return false;
  try {
    sessionStorage.setItem(key(userId, analysis.projectId), JSON.stringify(analysis));
    return true;
  } catch { return false; }
}

export function removeAnalysisDraft(userId: number, projectId: string) {
  try { sessionStorage.removeItem(key(userId, projectId)); } catch { /* Storage may be unavailable. */ }
}

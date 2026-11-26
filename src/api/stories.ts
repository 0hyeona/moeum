import { apiRequest } from './client';
import { getAccessToken } from './auth';
import { emptyStoryFields, type AnalysisMode, type Change, type Service, type Story, type StoryFields } from '../data/projects';
import { completeFigmaAnalysis } from '../data/figmaChanges';

export type ServerStoryStatus = 'draft' | 'published';
type StoryResponse = {
  id: number; project_id: number; title: string; content: string;
  story_status: ServerStoryStatus; created_at: string; updated_at: string;
  why?: string | null; problem?: string | null; solution?: string | null;
  result?: string | null; learned?: string | null; next_steps?: string | null;
  ai_analysis?: unknown;
};
type LinkedActivity = { activity_id: number; project_id: number; story_id: number | null; source: 'github' | 'figma' | 'notion' };
const serviceNames: Record<LinkedActivity['source'], Service> = { github: 'GitHub', figma: 'Figma', notion: 'Notion' };
export const objectValue = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function id(value: string) {
  if (!/^\d+$/.test(value) || !positiveId(Number(value))) throw new Error('유효한 프로젝트 또는 Story ID가 필요합니다.');
  return Number(value);
}
async function request<T>(path: string, options: RequestInit = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  options.signal?.throwIfAborted();
  return apiRequest<T>(path, { ...options, cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
}
function validateStory(value: unknown, projectId?: string, storyId?: string): StoryResponse {
  const row = objectValue(value);
  if (!positiveId(row.id) || !positiveId(row.project_id) || typeof row.title !== 'string' || typeof row.content !== 'string'
    || !['draft', 'published'].includes(String(row.story_status)) || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
    || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))
    || (projectId !== undefined && row.project_id !== id(projectId)) || (storyId !== undefined && row.id !== id(storyId))) {
    throw new Error('Story 응답 형식을 확인해주세요.');
  }
  return value as StoryResponse;
}
export function toStory(row: StoryResponse, links: LinkedActivity[] = []): Story {
  const analysis = objectValue(row.ai_analysis);
  const editor = objectValue(analysis.moeum_editor);
  const legacyIds = Array.isArray(analysis.sourceChangeIds)
    ? analysis.sourceChangeIds.filter((value): value is string => typeof value === 'string') : [];
  const legacySources = Object.entries(serviceNames).filter(([source]) => legacyIds.some(id => id.startsWith(source + ':'))).map(([, service]) => service);
  const attached = links.filter(link => link.story_id === row.id && link.project_id === row.project_id);
  return {
    ...emptyStoryFields, id: String(row.id), projectId: String(row.project_id), title: row.title,
    why: text(row.why), problem: text(row.problem), solution: text(row.solution), result: text(row.result),
    learned: text(row.learned), next: text(row.next_steps), memo: text(editor.memo ?? (Array.isArray(analysis.sourceChangeIds) ? row.content : '')),
    summary: text(analysis.summary), before: text(analysis.before), after: text(analysis.after),
    tags: Array.isArray(analysis.tags) ? analysis.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    rawAnalysis: analysis, updatedAt: row.updated_at,
    status: row.story_status === 'published' ? '완료' : '초안', date: row.created_at.slice(0, 10).replaceAll('-', '.'),
    sources: [...new Set([...legacySources, ...attached.map(link => serviceNames[link.source])])],
    sourceChangeIds: [...new Set([...legacyIds, ...attached.map(link => `${link.source}:${link.activity_id}`)])],
  };
}

// Only changed fields are patched. Keep unknown AI metadata and the server's content intact.
export function storyPatch(fields: Partial<StoryFields>, previousAnalysis: Record<string, unknown> = {}) {
  const body: Record<string, unknown> = {};
  for (const key of ['title', 'why', 'problem', 'solution', 'result', 'learned', 'next'] as const) {
    if (fields[key] === undefined) continue;
    const value = fields[key];
    const limit = key === 'title' ? 200 : 15000;
    if (typeof value !== 'string' || Array.from(value).length > limit || (key === 'title' && !value.trim())) {
      throw new Error(key === 'title' ? '제목을 1~200자로 입력해주세요.' : '회고 항목은 각각 15,000자까지 입력할 수 있어요.');
    }
    body[key === 'next' ? 'next_steps' : key] = key === 'title' ? value.trim() : value;
  }
  const analysis = { ...previousAnalysis };
  let changed = false;
  for (const key of ['summary', 'before', 'after', 'tags'] as const) {
    if (fields[key] === undefined) continue;
    if (key === 'tags') {
      if (fields.tags!.length > 10 || fields.tags!.some(tag => !tag.trim() || Array.from(tag).length > 40)) throw new Error('태그는 40자 이내로 최대 10개까지 입력할 수 있어요.');
      analysis.tags = [...new Set(fields.tags!.map(tag => tag.trim()))];
    } else {
      if (Array.from(fields[key]!).length > 3000) throw new Error('분석 항목은 각각 3,000자까지 입력할 수 있어요.');
      analysis[key] = fields[key];
    }
    changed = true;
  }
  if (fields.memo !== undefined) {
    if (Array.from(fields.memo).length > 15000) throw new Error('메모는 15,000자까지 입력할 수 있어요.');
    analysis.moeum_editor = { ...objectValue(analysis.moeum_editor), version: 1, memo: fields.memo };
    changed = true;
  }
  if (changed) body.ai_analysis = analysis;
  return body;
}
export function activityIds(changes: Change[], required = false) {
  if ((required && changes.length === 0) || changes.length > 20) throw new Error('변경사항을 1~20개 선택해주세요.');
  if (changes.some(change => !positiveId(change.activityId))) throw new Error('서버에 저장된 변경사항이 필요합니다. 변경사항을 새로고침해주세요.');
  return [...new Set(changes.map(change => change.activityId!))];
}
export async function analyzeActivities(projectId: string, changes: Change[], signal?: AbortSignal, mode: AnalysisMode = '의미 중심') {
  const analysisMode = { '의미 중심': 'semantic', '균형': 'balanced', '코드 상세': 'code' }[mode];
  const result = await request<unknown>('/stories/analyze', { method: 'POST', signal,
    body: JSON.stringify({ project_id: id(projectId), activity_ids: activityIds(changes, true), mode: analysisMode }) });
  const value = objectValue(result);
  if (!Array.isArray(value.tags) || value.tags.some(tag => typeof tag !== 'string')
    || ['title', 'summary', 'before', 'after'].some(key => value[key] !== null && typeof value[key] !== 'string')) throw new Error('AI 분석 응답 형식을 확인해주세요.');
  return completeFigmaAnalysis({ title: text(value.title), summary: text(value.summary), before: text(value.before), after: text(value.after), tags: value.tags as string[] }, changes);
}
async function linkedActivities(projectId: string, signal?: AbortSignal, storyId?: string) {
  const result: LinkedActivity[] = [];
  for (let offset = 0; ; offset += 100) {
    const query = new URLSearchParams({ unorganized: 'false', limit: '100', offset: String(offset) });
    if (storyId) query.set('story_id', String(id(storyId)));
    const page = await request<LinkedActivity[]>(`/api/projects/${id(projectId)}/activities?${query}`, { signal });
    if (!Array.isArray(page) || page.some(row => !row || !positiveId(row.activity_id) || row.project_id !== id(projectId)
      || !Object.hasOwn(serviceNames, row.source) || (row.story_id !== null && !positiveId(row.story_id)))) throw new Error('연결된 변경사항 응답 형식을 확인해주세요.');
    result.push(...page);
    if (page.length < 100) return result;
  }
}
export async function listStories(projectId: string, signal?: AbortSignal) {
  const rows: StoryResponse[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await request<unknown[]>(`/stories?project_id=${id(projectId)}&limit=100&offset=${offset}`, { signal });
    if (!Array.isArray(page)) throw new Error('Story 목록 응답 형식을 확인해주세요.');
    rows.push(...page.map(row => validateStory(row, projectId)));
    if (page.length < 100) break;
  }
  const links = rows.length ? await linkedActivities(projectId, signal) : [];
  return rows.map(row => toStory(row, links));
}
export async function getStory(storyId: string, signal?: AbortSignal) {
  const row = validateStory(await request(`/stories/${id(storyId)}`, { signal }), undefined, storyId);
  return toStory(row, await linkedActivities(String(row.project_id), signal, storyId));
}
export async function createStory(projectId: string, fields: StoryFields, changes: Change[]) {
  const row = validateStory(await request('/stories', { method: 'POST', body: JSON.stringify({
    ...storyPatch(fields), project_id: id(projectId), story_status: 'draft', activity_ids: activityIds(changes),
  }) }), projectId);
  // Use the confirmed selection immediately; later reads restore links from the activity API.
  return toStory(row, changes.map(change => ({ activity_id: change.activityId!, project_id: id(projectId), story_id: row.id,
    source: change.service.toLowerCase() as LinkedActivity['source'] })));
}
export async function updateStory(previous: Story, fields: Partial<StoryFields>, status?: ServerStoryStatus) {
  const row = validateStory(await request(`/stories/${id(previous.id)}`, { method: 'PATCH', body: JSON.stringify({
    ...storyPatch(fields, previous.rawAnalysis), ...(status ? { story_status: status } : {}),
  }) }), previous.projectId, previous.id);
  return { ...toStory(row), sources: previous.sources, sourceChangeIds: previous.sourceChangeIds };
}
export const deleteStory = (storyId: string) => request<void>(`/stories/${id(storyId)}`, { method: 'DELETE' });

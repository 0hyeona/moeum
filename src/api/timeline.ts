import { projectRequest } from './projects';
import { services, type Service, type Story, type StoryFields } from '../data/projects';

type StoryRow = {
  id: number; title: string; created_at: string; story_status: 'draft' | 'published';
  content: string; why?: string; problem?: string; solution?: string; result?: string;
  learned?: string; next_steps?: string; ai_analysis?: unknown;
};
type Activity = { story_id: number | null; source: string };

async function pages<T>(path: string, signal: AbortSignal, filters = '') {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await projectRequest<T[]>(path + '?limit=100&offset=' + offset + filters, { signal });
    rows.push(...page);
    if (page.length < 100) return rows;
  }
}

export async function loadTimeline(id: string, signal: AbortSignal): Promise<Story[]> {
  const path = '/api/projects/' + encodeURIComponent(id);
  const rows = await pages<StoryRow>(path + '/stories', signal);
  if (!rows.length) return [];
  const activities = await pages<Activity>(path + '/activities', signal, '&unorganized=false');
  const sources = new Map<number, Set<Service>>();
  for (const activity of activities) {
    const service = services.find(item => item.toLowerCase() === activity.source);
    if (activity.story_id == null || !service) continue;
    const linked = sources.get(activity.story_id) ?? new Set<Service>();
    linked.add(service);
    sources.set(activity.story_id, linked);
  }
  return rows.map(row => toStory(row, sources.get(row.id)));
}

function toStory(row: StoryRow, linkedSources?: Set<Service>): Story {
  const ai = row.ai_analysis && typeof row.ai_analysis === 'object' && !Array.isArray(row.ai_analysis)
    ? row.ai_analysis as Record<string, unknown> : {};
  const sourceChangeIds = Array.isArray(ai.sourceChangeIds)
    ? ai.sourceChangeIds.filter((id): id is string => typeof id === 'string') : [];
  const sources = new Set(linkedSources);
  for (const service of services) {
    if (sourceChangeIds.some(id => id.startsWith(service.toLowerCase() + ':'))) sources.add(service);
  }
  return {
    id: String(row.id), title: row.title, date: row.created_at.slice(0, 10).replaceAll('-', '.'),
    status: row.story_status === 'published' ? '완료' : '초안', sources: [...sources], sourceChangeIds,
    why: row.why ?? '', problem: row.problem ?? '', solution: row.solution ?? '', result: row.result ?? '',
    learned: row.learned ?? '', next: row.next_steps ?? '', memo: row.content,
    tags: Array.isArray(ai.tags) ? ai.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    summary: typeof ai.summary === 'string' ? ai.summary : '',
    before: typeof ai.before === 'string' ? ai.before : '', after: typeof ai.after === 'string' ? ai.after : '',
    analysisData: ai,
  };
}

function storyPayload(fields: StoryFields, metadata?: Record<string, unknown>) {
  const { title, why, problem, solution, result, learned, next, memo, tags, summary, before, after } = fields;
  return {
    title, why, problem, solution, result, learned, next_steps: next, content: memo, story_status: 'published',
    ai_analysis: { ...metadata, tags, summary, before, after },
  };
}

export async function createStoredStory(projectId: string, fields: StoryFields, sourceChangeIds: string[]) {
  // GitHub changes use repository + SHA. Only Figma and Notion changes carry database activity IDs.
  const activityIds = sourceChangeIds.flatMap(id => {
    const match = /^(?:figma|notion):([1-9]\d*)$/.exec(id);
    return match ? [Number(match[1])] : [];
  });
  const row = await projectRequest<StoryRow>('/stories', {
    method: 'POST',
    body: JSON.stringify({ ...storyPayload(fields, { sourceChangeIds }),
      project_id: Number(projectId), activity_ids: activityIds }),
  });
  return toStory(row);
}

export function updateStoredStory(story: Story, fields: StoryFields) {
  return projectRequest('/stories/' + encodeURIComponent(story.id), {
    method: 'PATCH', body: JSON.stringify(storyPayload(fields, story.analysisData)),
  });
}

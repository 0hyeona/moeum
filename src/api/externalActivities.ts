import { apiRequest } from './client';
import { getAccessToken } from './auth';
import { toChange } from '../data/activity';
import type { Change } from '../data/projects';

type ExternalService = 'Figma' | 'Notion';
type SyncResult = { source: string; has_next: boolean; next_cursor: string | null };
type ActivityResponse = {
  activity_id: number; project_id: number; story_id: number | null;
  source: string; title: string; description: string | null;
  external_id: string | null; source_url: string | null; occurred_at: string;
};

// Only the MOEUM access token is sent here. Provider tokens stay on the backend.
export async function loadExternalActivities({ projectId, service, signal }: {
  projectId: string; service: ExternalService; signal: AbortSignal;
}): Promise<Change[]> {
  const token = getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  const source = service.toLowerCase();
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const request = <T>(path: string, method = 'GET') => {
    signal.throwIfAborted();
    return apiRequest<T>(path, { method, signal, headers: { Authorization: `Bearer ${token}` } });
  };
  let cursor: string | null = null;
  const cursors = new Set<string>();
  do {
    const query: string = cursor ? `?${new URLSearchParams({ cursor })}` : '';
    const result: SyncResult = await request<SyncResult>(`${base}/${source}/sync${query}`, 'POST');
    if (!result || result.source !== source || typeof result.has_next !== 'boolean') {
      throw new Error(`${service} 수집 응답 형식을 확인해주세요.`);
    }
    if (!result.has_next) break;
    if (service !== 'Figma' || !result.next_cursor || cursors.has(result.next_cursor)) {
      throw new Error(`${service} 다음 수집 페이지를 확인할 수 없어요. 다시 시도해주세요.`);
    }
    cursor = result.next_cursor;
    cursors.add(cursor);
  } while (true);

  const changes: Change[] = [];
  for (let offset = 0; ; offset += 100) {
    const query = new URLSearchParams({ source, unorganized: 'true', limit: '100', offset: String(offset) });
    const page = await request<ActivityResponse[]>(`${base}/activities?${query}`);
    if (!Array.isArray(page) || page.some(item => !item || !Number.isInteger(item.activity_id)
      || String(item.project_id) !== projectId || item.source !== source || typeof item.title !== 'string')) {
      throw new Error(`${service} 변경사항 응답 형식을 확인해주세요.`);
    }
    for (const item of page) {
      if (item.story_id !== null) continue;
      // Database datetimes are UTC; older responses may omit the timezone suffix.
      const date = item.occurred_at;
      const occurredAt = date && !/(Z|[+-]\d{2}:\d{2})$/i.test(date) ? `${date}Z` : date;
      changes.push(toChange({ id: String(item.activity_id), service, title: item.title,
        description: item.description, occurredAt, reference: item.source_url ?? item.external_id ?? String(item.activity_id) }));
    }
    if (page.length < 100) return changes;
  }
}

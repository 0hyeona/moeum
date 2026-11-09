import { ApiError, apiRequest } from './client';
import { getAccessToken } from './auth';
import { toChange } from '../data/activity';
import type { Change } from '../data/projects';

type ExternalService = 'Figma' | 'Notion';
type ExternalRequest = { projectId: string; service: ExternalService; signal: AbortSignal };
type SyncResult = { source: string; has_next: boolean; next_cursor: string | null };
type FigmaSyncStatus = { running: boolean; can_sync: boolean; retry_after_seconds: number; next_sync_at: string | null };
type FigmaRefreshResult = { nextCursor: string | null } | { message: string; retryAt?: number };
type ActivityResponse = {
  activity_id: number; project_id: number; story_id: number | null;
  source: string; title: string; description: string | null;
  external_id: string | null; source_url: string | null; occurred_at: string;
};

const projectPath = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

// Only the MOEUM access token is sent here. Provider tokens stay on the backend.
function activityRequest({ service, signal }: ExternalRequest) {
  const token = getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  return <T>(path: string, method = 'GET') => {
    signal.throwIfAborted();
    return apiRequest<T>(path, {
      method, signal, headers: { Authorization: `Bearer ${token}` },
      ...(service === 'Figma' && { cache: 'no-store' }),
    });
  };
}

async function collectPage(input: ExternalRequest, cursor: string | null) {
  const { projectId, service } = input;
  const source = service.toLowerCase();
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : '';
  const result = await activityRequest(input)<SyncResult>(`${projectPath(projectId)}/${source}/sync${query}`, 'POST');
  if (!result || result.source !== source || typeof result.has_next !== 'boolean') {
    throw new Error(`${service} 수집 응답 형식을 확인해주세요.`);
  }
  if (!result.has_next) return null;
  if (service !== 'Figma' || typeof result.next_cursor !== 'string' || !result.next_cursor || result.next_cursor === cursor) {
    throw new Error(`${service} 다음 수집 페이지를 확인할 수 없어요. 다시 시도해주세요.`);
  }
  return result.next_cursor;
}

export async function refreshFigmaPage(projectId: string, cursor: string | null, signal: AbortSignal): Promise<FigmaRefreshResult> {
  const input = { projectId, service: 'Figma', signal } as const;
  const request = activityRequest(input);
  async function getStatus() {
    const status = await request<FigmaSyncStatus>(`${projectPath(projectId)}/figma/sync-status`);
    if (typeof status?.can_sync !== 'boolean' || typeof status.running !== 'boolean') {
      throw new Error('Figma 수집 상태 응답 형식을 확인해주세요.');
    }
    return status;
  }

  const status = await getStatus();
  if (status.running) return { message: 'Figma 수집이 이미 진행 중이에요. 잠시 후 새로고침으로 상태를 확인해주세요.' };
  if (!status.can_sync) {
    const retryAt = statusRetryAt(status);
    return { message: retryAt ? 'Figma 재수집 대기 중이에요.' : 'Figma 재수집 대기 중이에요. 잠시 후 다시 시도해주세요.', retryAt };
  }

  try {
    return { nextCursor: await collectPage(input, cursor) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 409 && error.message.includes('이미 진행 중')) return { message: error.message };
    if (error.status !== 429) throw error;
    const message = error.message;
    const header = error.headers.get('Retry-After')?.trim();
    const retryAt = header && (/^\d+$/.test(header) ? Date.now() + Number(header) * 1000 : Date.parse(header));
    if (retryAt && Number.isFinite(retryAt) && retryAt > Date.now()) return { message, retryAt };
    // Cross-origin responses may hide Retry-After. The server stores the deadline.
    const updated = await getStatus().catch(() => undefined);
    signal.throwIfAborted();
    return { message, retryAt: updated && statusRetryAt(updated) };
  }
}

function statusRetryAt(status: FigmaSyncStatus) {
  const deadline = Date.parse(status.next_sync_at ?? '');
  // Relative seconds also account for differences between the client and server clocks.
  const relative = status.retry_after_seconds > 0 ? Date.now() + status.retry_after_seconds * 1000 : NaN;
  const retryAt = Number.isFinite(relative) ? relative : deadline;
  return retryAt > Date.now() && Number.isFinite(retryAt) ? retryAt : undefined;
}

export async function syncNotionActivities(input: Omit<ExternalRequest, 'service'>) {
  const request = { ...input, service: 'Notion' } as const;
  await collectPage(request, null);
  return loadExternalActivities(request);
}

export async function loadExternalActivities(input: ExternalRequest): Promise<Change[]> {
  const { projectId, service } = input;
  const source = service.toLowerCase();
  const request = activityRequest(input);
  const path = service === 'Figma' ? '/project_activities' : `${projectPath(projectId)}/activities`;
  const changes: Change[] = [];
  for (let offset = 0; ; offset += 100) {
    const query = new URLSearchParams({ source, unorganized: 'true', limit: '100', offset: String(offset) });
    if (service === 'Figma') query.set('project_id', projectId);
    const page = await request<ActivityResponse[]>(`${path}?${query}`);
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

import { apiRequest } from './client';
import { getAccessToken } from './auth';
import { loadExternalActivities } from './externalActivities';

type Page = { page: number; has_next: boolean };
export async function syncGithubActivities({ projectId, signal }: { projectId: string; signal: AbortSignal }) {
  const token = getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다.');
  const base = `/api/projects/${encodeURIComponent(projectId)}/github`;
  async function request<T>(path: string, method = 'GET') {
    signal.throwIfAborted();
    return apiRequest<T>(path, { method, signal, headers: { Authorization: `Bearer ${token}` } });
  }
  const branches = new Set<string>();
  for (let page = 1; ; page++) {
    const result = await request<Page & { items: { name: string }[] }>(`${base}/branches?page=${page}&per_page=100`);
    if (!result || result.page !== page || typeof result.has_next !== 'boolean' || !Array.isArray(result.items)
      || result.items.some(item => !item || typeof item.name !== 'string' || !item.name)) throw new Error('GitHub 브랜치 응답 형식을 확인해주세요.');
    result.items.forEach(item => branches.add(item.name));
    if (!result.has_next) break;
    if (!result.items.length) throw new Error('GitHub 다음 브랜치 페이지를 확인할 수 없어요.');
  }
  for (const branch of branches) {
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ branch, page: String(page), per_page: '100' });
      const result = await request<Page>(`${base}/sync?${query}`, 'POST');
      if (!result || result.page !== page || typeof result.has_next !== 'boolean') throw new Error('GitHub 수집 응답 형식을 확인해주세요.');
      if (!result.has_next) break;
    }
  }
  return loadExternalActivities({ projectId, service: 'GitHub', signal });
}

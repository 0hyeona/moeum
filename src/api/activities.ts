import { projectRequest } from './projects';
import { ApiError } from './client';
import { githubRepository } from '../data/github';
import { githubChanges } from '../data/githubChanges';
import type { GitHubCommit } from './github';

type StoredActivity = {
  activity_id: number; project_id: number; source: string; story_id: number | null; external_id: string | null;
  branch_name: string | null; title: string; description: string | null;
  occurred_at: string; source_url: string | null;
};
export type StoredCommit = GitHubCommit & { branch: string | null };
const projectPath = (id: string) => '/api/projects/' + encodeURIComponent(id);

export async function readGithubActivities(id: string, url: string, signal: AbortSignal) {
  const repository = githubRepository(url)?.toLowerCase();
  if (!repository) throw new Error('GitHub 저장소 URL을 확인해주세요.');
  const commits: StoredCommit[] = [];
  const activityIds = new Map<string, number>();
  const pending: StoredCommit[] = [];
  for (let offset = 0; ; offset += 100) {
    const rows = await projectRequest<StoredActivity[]>(
      projectPath(id) + '/activities?source=github&limit=100&offset=' + offset, { signal });
    for (const row of rows) {
      if (String(row.project_id) !== id || row.source !== 'github') continue;
      const sha = row.external_id?.split(':').pop();
      if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) continue;
      // Old repositories can still have activities after the project URL changes.
      const scopedId = repository + ':' + sha;
      const commitUrl = 'https://github.com/' + repository + '/commit/' + sha;
      if (row.external_id?.toLowerCase() !== scopedId.toLowerCase()
        && row.source_url?.toLowerCase() !== commitUrl.toLowerCase()) continue;
      const date = /(?:Z|[+-]\d\d:\d\d)$/i.test(row.occurred_at) ? row.occurred_at : row.occurred_at + 'Z';
      const commit = { branch: row.branch_name, sha, message: row.description || row.title, date,
        merged: false, additions: null, deletions: null };
      activityIds.set(sha, row.activity_id);
      commits.push(commit);
      if (row.story_id === null) pending.push(commit);
    }
    if (rows.length < 100) break;
  }
  return { commits, changes: githubChanges(repository, pending).map((change, i) => {
    const activityId = activityIds.get(pending[i].sha);
    return activityId ? { ...change, id: 'github:' + activityId, activityId } : change;
  }) };
}

export async function syncGithubActivities(id: string, signal: AbortSignal) {
  const path = projectPath(id) + '/github';
  // Discover branches and import their history only on explicit refresh.
  const branches = new Set<string>();
  for (let page = 1; ; page++) {
    const result = await projectRequest<{ items: { name: string }[]; has_next: boolean }>(
      path + '/branches?page=' + page + '&per_page=100', { signal });
    result.items.forEach(item => branches.add(item.name));
    if (!result.has_next) break;
  }
  for (const branch of branches) {
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ branch, page: String(page), per_page: '100' });
      const result = await projectRequest<{ has_next: boolean }>(path + '/sync?' + query, { method: 'POST', signal });
      if (!result.has_next) break;
    }
  }
}

export async function refreshGithubActivities(id: string, url: string, signal: AbortSignal) {
  let error: string | undefined;
  let recovery: 'github-reconnect' | undefined;
  try {
    await syncGithubActivities(id, signal);
  } catch (cause) {
    if (signal.aborted || (cause instanceof Error && cause.name === 'AbortError')
      || (cause instanceof ApiError && cause.status === 401)) throw cause;
    error = cause instanceof Error ? cause.message : 'GitHub 최신 기록을 가져오지 못했어요.';
    if (cause instanceof ApiError && cause.status === 409 && (cause.code === 'GITHUB_RECONNECT_REQUIRED'
      || /GitHub 연결이 만료/.test(cause.message))) recovery = 'github-reconnect';
  }
  // Stored records remain readable even when GitHub rejects the latest import.
  return { ...await readGithubActivities(id, url, signal), error, recovery };
}

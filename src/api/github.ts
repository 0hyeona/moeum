import { githubRepository } from '../data/github';

export type GitHubRepository = { name: string; defaultBranch: string; branches: string[] };
export type GitHubCommit = {
  sha: string; message: string; date: string | null; merged: boolean;
  additions: number | null; deletions: number | null;
};
type CommitResponse = {
  sha: string;
  commit: { message: string; committer: { date: string } | null; author: { date: string } | null };
  parents: { sha: string }[];
  stats?: { additions: number; deletions: number };
};

export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

function repositoryPath(value: string) {
  const name = githubRepository(value);
  if (!name) throw new GitHubError(400, 'GitHub 저장소 URL을 확인해주세요. 소유자와 저장소 이름이 모두 필요해요.');
  return `/repos/${name.split('/').map(encodeURIComponent).join('/')}`;
}

// Public repository reads only. Never forward the app login token to GitHub.
async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      signal, credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new GitHubError(0, 'GitHub에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
  }
  if (!response.ok) {
    const message = response.status === 404
      ? '저장소를 찾을 수 없거나 비공개 저장소예요. URL을 확인해주세요. 비공개 저장소 조회는 아직 지원하지 않아요.'
      : response.status === 403 || response.status === 429
        ? 'GitHub 요청 한도에 도달했거나 접근이 제한됐어요. 잠시 후 다시 시도해주세요.'
        : response.status === 409 ? '아직 커밋이 없는 저장소예요.'
          : 'GitHub 기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.';
    throw new GitHubError(response.status, message);
  }
  return response.json() as Promise<T>;
}

export async function loadGitHubRepository(url: string, signal: AbortSignal): Promise<GitHubRepository> {
  const path = repositoryPath(url);
  const repository = await request<{ default_branch: string }>(path, signal);
  const branches: string[] = [];
  for (let page = 1; ; page++) {
    let batch: { name: string }[];
    try {
      batch = await request<{ name: string }[]>(`${path}/branches?per_page=100&page=${page}`, signal);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 409) break;
      throw error;
    }
    branches.push(...batch.map(branch => branch.name));
    if (batch.length < 100) break;
  }
  const unique = [...new Set(branches)];
  return {
    name: githubRepository(url)!, defaultBranch: repository.default_branch,
    branches: unique.includes(repository.default_branch)
      ? [repository.default_branch, ...unique.filter(branch => branch !== repository.default_branch)] : unique,
  };
}

export async function loadGitHubCommits(url: string, branch: string, signal: AbortSignal): Promise<GitHubCommit[]> {
  const path = repositoryPath(url);
  let commits: CommitResponse[];
  try {
    commits = await request<CommitResponse[]>(`${path}/commits?sha=${encodeURIComponent(branch)}&per_page=5`, signal);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 409) return [];
    throw error;
  }
  return Promise.all(commits.map(async commit => {
    let stats: CommitResponse['stats'];
    try {
      const detail = await request<CommitResponse>(`${path}/commits/${encodeURIComponent(commit.sha)}`, signal);
      stats = detail.stats;
    } catch (error) {
      if (signal.aborted) throw error;
      // Keep the real commit visible when only its line-count request fails.
    }
    return {
      sha: commit.sha, message: commit.commit.message,
      date: commit.commit.committer?.date ?? commit.commit.author?.date ?? null,
      merged: commit.parents.length > 1,
      additions: stats?.additions ?? null, deletions: stats?.deletions ?? null,
    };
  }));
}

// Collect list data without one detail request per commit. Page through every
// branch and deduplicate shared history by the full SHA.
export async function loadGitHubChangeCommits(url: string, branches: string[], signal: AbortSignal): Promise<GitHubCommit[]> {
  const path = repositoryPath(url);
  const unique = new Map<string, GitHubCommit>();
  for (const branch of branches) {
    for (let page = 1; ; page++) {
      let batch: CommitResponse[];
      try {
        batch = await request<CommitResponse[]>(`${path}/commits?sha=${encodeURIComponent(branch)}&per_page=100&page=${page}`, signal);
      } catch (error) {
        if (error instanceof GitHubError && error.status === 409) break;
        throw error;
      }
      for (const commit of batch) {
        unique.set(commit.sha, {
          sha: commit.sha, message: commit.commit.message,
          date: commit.commit.committer?.date ?? commit.commit.author?.date ?? null,
          merged: commit.parents.length > 1, additions: null, deletions: null,
        });
      }
      if (batch.length < 100) break;
    }
  }
  return [...unique.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

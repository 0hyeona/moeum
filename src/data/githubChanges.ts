import type { GitHubCommit } from '../api/github';
import type { Project, Change } from './projects';

export function githubChanges(repository: string, commits: GitHubCommit[], now = new Date()): Change[] {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return commits.map(commit => {
    const date = commit.date ? new Date(commit.date) : null;
    const day = date && Number.isFinite(date.getTime()) ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) : null;
    return {
      id: `github:${repository.toLowerCase()}:${commit.sha}`, service: 'GitHub',
      reference: commit.sha.slice(0, 7), title: commit.message.split('\n')[0],
      description: commit.message, meta: `커밋 ${commit.sha.slice(0, 7)} · ${date && day !== null ? date.toLocaleDateString('ko-KR') : '날짜 정보 없음'}`,
      status: commit.merged ? '머지' : '커밋', labels: [repository, commit.merged ? '머지' : '커밋'],
      daysAgo: day === null ? Infinity : Math.max(0, Math.floor((today - day) / 86400000)),
      before: '', after: commit.message,
    };
  });
}

export function replaceGithubChanges(project: Project, incoming: Change[]): Project {
  const organized = new Set(project.stories.flatMap(story => story.sourceChangeIds ?? []));
  const changes = [...new Map(incoming.map(change => [change.id, change])).values()].filter(change => !organized.has(change.id));
  return { ...project, changes: [...project.changes.filter(change => change.service !== 'GitHub'), ...changes] };
}

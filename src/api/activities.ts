import type { Change, Service } from '../data/projects';
import { githubChanges } from '../data/githubChanges';
import { loadGitHubChangeCommits, loadGitHubRepository } from './github';
import { syncNotionActivities } from './externalActivities';

export type ActivityRequest = { projectId: string; service: Service; url: string; signal: AbortSignal };
export type ActivityLoader = (request: ActivityRequest) => Promise<Change[]>;

// [] means a successful request with no unorganized changes; failures throw.
export const activityLoaders: Record<Exclude<Service, 'Figma'>, ActivityLoader> = {
  GitHub: async ({ url, signal }) => {
    const repository = await loadGitHubRepository(url, signal);
    return githubChanges(repository.name, await loadGitHubChangeCommits(url, repository.branches, signal));
  },
  Notion: syncNotionActivities,
};

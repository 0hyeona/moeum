import type { Change, Service } from '../data/projects';
import { syncGithubActivities } from './githubActivities';
import { syncNotionActivities } from './externalActivities';

export type ActivityRequest = { projectId: string; service: Service; url: string; signal: AbortSignal };
export type ActivityLoader = (request: ActivityRequest) => Promise<Change[]>;

export const activityLoaders: Record<Exclude<Service, 'Figma'>, ActivityLoader> = {
  GitHub: syncGithubActivities,
  Notion: syncNotionActivities,
};

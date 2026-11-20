import { apiRequest } from './client';
import { getAccessToken } from './auth';
import { githubRepository } from '../data/github';
import type { Project, Service, ServiceState } from '../data/projects';

export type ProjectResponse = {
  id: number; owner_id: number; project_name: string; description: string | null;
  github_url: string | null; figma_url: string | null; notion_url: string | null;
  project_status: string; created_at: string; updated_at: string;
};
export type ProjectInput = {
  project_name: string; description?: string | null;
  github_url?: string | null; figma_url?: string | null; notion_url?: string | null;
};

export function projectRequest<T>(path: string, options: RequestInit = {}) {
  const token = getAccessToken();
  if (!token) return Promise.reject(new Error('로그인이 필요합니다.'));
  return apiRequest<T>(path, { ...options, headers: { Authorization: `Bearer ${token}` } });
}

export async function listProjects(signal?: AbortSignal) {
  const projects: ProjectResponse[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await projectRequest<ProjectResponse[]>(`/projects?limit=100&offset=${offset}&project_status=all`, { signal });
    projects.push(...page);
    if (page.length < 100) return projects;
  }
}
export const getProject = (id: string, signal?: AbortSignal) => projectRequest<ProjectResponse>(`/projects/${encodeURIComponent(id)}`, { signal });
export const createProject = (input: ProjectInput) => projectRequest<ProjectResponse>('/projects', { method: 'POST', body: JSON.stringify(input) });
export const updateProject = (id: string, input: Partial<ProjectInput>) => projectRequest<ProjectResponse>(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteProject = (id: string) => projectRequest<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });

export function toProject(data: ProjectResponse, previous?: Project): Project {
  const urls = { GitHub: data.github_url ?? '', Figma: data.figma_url ?? '', Notion: data.notion_url ?? '' };
  return {
    id: String(data.id), name: data.project_name, description: data.description ?? '',
    status: data.project_status === 'archived' ? '보관됨' : '진행 중',
    updatedAt: data.updated_at.slice(0, 10).replaceAll('-', '.'),
    ...projectLinks(urls, previous), stories: previous?.stories ?? [], commits: previous?.commits ?? [],
  };
}

export function projectLinks(urls: Record<Service, string>, previous?: Project) {
  const repository = githubRepository(urls.GitHub);
  const sameSource = (service: Service) => service === 'GitHub'
    ? githubRepository(previous?.urls?.GitHub ?? '') === repository
    : (previous?.urls?.[service] ?? '') === urls[service];
  const state = (service: Service): ServiceState => ({ status: urls[service] ? 'connected' : 'disconnected' });
  return {
    urls,
    services: { GitHub: state('GitHub'), Figma: state('Figma'), Notion: state('Notion') },
    repositories: repository ? [repository] : [], selectedRepository: repository,
    changes: previous?.changes.filter(change => sameSource(change.service)) ?? [],
  };
}

export type Connection = {
  source: 'github' | 'figma' | 'notion';
  external_url: string | null;
  connection_status: 'not_linked' | 'invalid_url' | 'configuration_required' | 'configured' | 'public_access_unverified';
  detail: string;
};
type Connections = { connections: Connection[] };
const connectionsPath = (id: string) => '/api/projects/' + encodeURIComponent(id) + '/connections';
export const getConnections = (id: string, signal: AbortSignal) =>
  projectRequest<Connections>(connectionsPath(id), { signal });
export const saveConnection = (id: string, service: Service, url: string | null) =>
  projectRequest<Connections>(connectionsPath(id) + '/' + service.toLowerCase(), {
    method: 'PATCH', body: JSON.stringify({ external_url: url }),
  });

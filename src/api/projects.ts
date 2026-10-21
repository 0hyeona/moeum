import { apiRequest } from './client';
import { getAccessToken } from './auth';
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

function request<T>(path: string, options: RequestInit = {}) {
  const token = getAccessToken();
  if (!token) return Promise.reject(new Error('로그인이 필요합니다.'));
  return apiRequest<T>(path, { ...options, headers: { Authorization: `Bearer ${token}` } });
}

export async function listProjects(signal?: AbortSignal) {
  const projects: ProjectResponse[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await request<ProjectResponse[]>(`/projects?limit=100&offset=${offset}&project_status=all`, { signal });
    projects.push(...page);
    if (page.length < 100) return projects;
  }
}
export const getProject = (id: string, signal?: AbortSignal) => request<ProjectResponse>(`/projects/${encodeURIComponent(id)}`, { signal });
export const createProject = (input: ProjectInput) => request<ProjectResponse>('/projects', { method: 'POST', body: JSON.stringify(input) });
export const updateProject = (id: string, input: Partial<ProjectInput>) => request<ProjectResponse>(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteProject = (id: string) => request<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });

export function toProject(data: ProjectResponse, previous?: Project): Project {
  const urls = { GitHub: data.github_url ?? '', Figma: data.figma_url ?? '', Notion: data.notion_url ?? '' };
  const state = (service: Service): ServiceState => ({ status: urls[service] ? 'connected' : 'disconnected' });
  return {
    id: String(data.id), name: data.project_name, description: data.description ?? '',
    status: data.project_status === 'archived' ? '보관됨' : '진행 중',
    updatedAt: data.updated_at.slice(0, 10).replaceAll('-', '.'), urls,
    services: { GitHub: state('GitHub'), Figma: state('Figma'), Notion: state('Notion') },
    repositories: previous?.repositories ?? [], selectedRepository: previous?.selectedRepository ?? null,
    changes: previous?.changes ?? [], stories: previous?.stories ?? [], commits: previous?.commits ?? [],
  };
}

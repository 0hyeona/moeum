import type { Change, Project, Service } from './projects';

export type ActivityState =
  | { status: 'disconnected' }
  | { status: 'pending' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; error: string };

// Frontend view model; map the confirmed backend schema to these fields.
export type ActivityItem = {
  id: string;
  service: Service;
  title: string;
  description?: string | null;
  occurredAt?: string | null;
  reference?: string;
  status?: string;
  labels?: string[];
  before?: string;
  after?: string;
};

export function toChange(item: ActivityItem, now = new Date()): Change {
  const date = item.occurredAt ? new Date(item.occurredAt) : null;
  const valid = date !== null && Number.isFinite(date.getTime());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const day = valid ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) : null;
  return {
    id: `${item.service.toLowerCase()}:${item.id}`, service: item.service,
    title: item.title, description: item.description ?? '',
    reference: item.reference ?? item.id, status: item.status ?? '업데이트',
    labels: item.labels ?? [], before: item.before ?? '', after: item.after ?? '',
    meta: valid ? date.toLocaleString('ko-KR') : '날짜 정보 없음',
    daysAgo: day === null ? Infinity : Math.max(0, Math.floor((today - day) / 86400000)),
  };
}

export function replaceServiceChanges(project: Project, service: Service, incoming: Change[]): Project {
  const organized = new Set(project.stories.flatMap(story => story.sourceChangeIds ?? []));
  const unique = new Map(incoming.filter(change => change.service === service && !organized.has(change.id)).map(change => [change.id, change]));
  return { ...project, changes: [...project.changes.filter(change => change.service !== service), ...unique.values()] };
}

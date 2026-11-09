import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { loadExternalActivities, refreshFigmaPage } from '../api/externalActivities';
import { replaceServiceChanges, type ActivityState } from '../data/activity';
import type { Project } from '../data/projects';

type RefreshState =
  | { status: 'syncing' }
  | { status: 'waiting'; message: string; retryAt?: number }
  | { status: 'error'; message: string; key: string };

function savedCursor(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export function useFigmaActivities(userId: number, project: Project | undefined, setProjects: Dispatch<SetStateAction<Project[]>>) {
  const projectId = project?.id;
  const url = project?.urls?.Figma;
  const key = `moeum.figma-cursor.${JSON.stringify([userId, projectId, url])}`;

  const [lists, setLists] = useState<Record<string, ActivityState>>({});
  const [refreshes, setRefreshes] = useState<Partial<Record<string, RefreshState>>>({});
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const reads = useRef(new Map<string, AbortController>());
  const syncs = useRef(new Map<string, { key: string; controller: AbortController }>());

  const readList = useCallback(async (signal: AbortSignal) => {
    if (!projectId || !url) return;
    setLists(current => ({ ...current, [key]: { status: 'loading' } }));
    try {
      const incoming = await loadExternalActivities({ projectId, service: 'Figma', signal });
      if (signal.aborted) return;
      setProjects(current => current.map(item => item.id === projectId && item.urls?.Figma === url
        ? replaceServiceChanges(item, 'Figma', incoming) : item));
      setLists(current => ({ ...current, [key]: { status: 'ready' } }));
    } catch (error) {
      if (signal.aborted) return;
      setLists(current => ({ ...current, [key]: {
        status: 'error', error: error instanceof Error ? error.message : '저장된 Figma 변경사항을 불러오지 못했어요.',
      } }));
    }
  }, [key, projectId, setProjects, url]);

  const reload = useCallback(() => {
    if (!projectId || !url || reads.current.has(key) || syncs.current.get(projectId)?.key === key) return;
    const controller = new AbortController();
    reads.current.set(key, controller);
    const release = () => {
      if (reads.current.get(key) === controller) reads.current.delete(key);
    };
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return readList(controller.signal);
    }).finally(release);
    return () => { controller.abort(); release(); };
  }, [key, projectId, readList, url]);

  useEffect(() => {
    const activeReads = reads.current;
    const activeSyncs = syncs.current;
    return () => {
      activeReads.forEach(controller => controller.abort());
      activeSyncs.forEach(({ controller }) => controller.abort());
      activeReads.clear();
      activeSyncs.clear();
    };
  }, []);

  const state = projectId ? refreshes[projectId] : undefined;
  const retryAt = state?.status === 'waiting' ? state.retryAt : undefined;
  useEffect(() => {
    if (!projectId || retryAt === undefined) return;
    const id = projectId;
    const deadline = retryAt;
    let timer: ReturnType<typeof setTimeout>;
    function clearWait() {
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        timer = setTimeout(clearWait, Math.min(remaining, 2_147_483_647));
        return;
      }
      setRefreshes(current => current[id] === state ? { ...current, [id]: undefined } : current);
    }
    clearWait();
    return () => clearTimeout(timer);
  }, [projectId, retryAt, state]);

  const cursor = key in cursors ? cursors[key] : savedCursor(key);
  async function refresh() {
    if (!projectId || !url || reads.current.has(key) || syncs.current.has(projectId) || (retryAt ?? 0) > Date.now()) return;
    const controller = new AbortController();
    syncs.current.set(projectId, { key, controller });
    setRefreshes(current => ({ ...current, [projectId]: { status: 'syncing' } }));
    try {
      const result = await refreshFigmaPage(projectId, cursor, controller.signal);
      if (controller.signal.aborted) return;
      if ('message' in result) {
        setRefreshes(current => ({ ...current, [projectId]: { status: 'waiting', ...result } }));
        return;
      }
      setCursors(current => ({ ...current, [key]: result.nextCursor }));
      try {
        if (result.nextCursor) sessionStorage.setItem(key, result.nextCursor);
        else sessionStorage.removeItem(key);
      } catch { /* The in-memory cursor also works when storage is unavailable. */ }
      await readList(controller.signal);
      if (!controller.signal.aborted) setRefreshes(current => ({ ...current, [projectId]: undefined }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setRefreshes(current => ({ ...current, [projectId]: {
        status: 'error', key, message: error instanceof Error ? error.message : 'Figma 변경사항을 수집하지 못했어요.',
      } }));
    } finally {
      if (syncs.current.get(projectId)?.controller === controller) syncs.current.delete(projectId);
    }
  }

  const listState: ActivityState = !url ? { status: 'disconnected' } : lists[key] ?? { status: 'loading' };
  const syncing = state?.status === 'syncing';
  const waiting = state?.status === 'waiting';
  const error = state?.status === 'error' && state.key === key ? state.message : undefined;
  const notice = waiting && retryAt !== undefined
    ? `${state.message} ${new Date(retryAt).toLocaleString('ko-KR')} 이후 다시 시도할 수 있어요.`
    : waiting ? state.message : error;
  return {
    listState, syncing, notice, error, retryAt, hasMore: Boolean(cursor),
    refreshDisabled: syncing || listState.status === 'loading' || (retryAt ?? 0) > Date.now(),
    reload, refresh,
  };
}

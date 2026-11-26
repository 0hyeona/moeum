import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { readGithubActivities, refreshGithubActivities, type StoredCommit } from '../api/activities';
import { replaceServiceChanges, type ActivityState } from '../data/activity';
import type { Project } from '../data/projects';

export function useGithubActivities(project: Project | undefined, setProjects: Dispatch<SetStateAction<Project[]>>) {
  const id = project?.id;
  const url = project?.urls?.GitHub;
  const key = JSON.stringify([id, url]);
  const running = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ key: string; state: ActivityState; commits: StoredCommit[] }>();
  const load = useCallback(async (sync: boolean) => {
    if (!id || !url || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setResult(last => ({ key, commits: last?.key === key ? last.commits : [], state: { status: 'loading' } }));
    try {
      const activities: Awaited<ReturnType<typeof readGithubActivities>> & { error?: string } = sync
        ? await refreshGithubActivities(id, url, controller.signal)
        : await readGithubActivities(id, url, controller.signal);

      const { commits, changes } = activities;
      if (controller.signal.aborted) return;
      setProjects(items => items.map(item => item.id === id && item.urls?.GitHub === url
        ? replaceServiceChanges(item, 'GitHub', changes) : item));
      setResult({ key, commits, state: activities.error ? { status: 'error', error: activities.error } : { status: 'ready' } });
    } catch (error) {
      if (!controller.signal.aborted) setResult(last => ({ key, commits: last?.key === key ? last.commits : [],
        state: { status: 'error', error: error instanceof Error ? error.message : 'GitHub 기록을 불러오지 못했어요.' } }));
    } finally {
      if (running.current === controller) running.current = null;
    }
  }, [id, url, key, setProjects]);
  useEffect(() => {
    void load(false);
    return () => { running.current?.abort(); running.current = null; };
  }, [load]);
  const state: ActivityState = !url ? { status: 'disconnected' } :
    result?.key === key ? result.state : { status: 'loading' };
  return { state, commits: result?.key === key ? result.commits : [], refresh: () => void load(true) };
}

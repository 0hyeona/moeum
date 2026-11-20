import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import * as api from '../api/stories';
import type { Change, Project, Story, StoryFields } from '../data/projects';

export type StoryListState = { status: 'loading' | 'ready' | 'error'; error?: string };
export function useStoryStore(projectId: string | null, setProjects: Dispatch<SetStateAction<Project[]>>) {
  const [states, setStates] = useState<Record<string, StoryListState>>({});
  const [attempt, setAttempt] = useState(0);
  const records = useRef(new Map<string, Story>());
  const revisions = useRef(new Map<string, { version: number; projectId: string; story: Story | null }>());
  const version = useRef(0);
  const queues = useRef(new Map<string, Promise<unknown>>());
  const creating = useRef(new Map<string, Promise<Story>>());
  const reloadStories = useCallback(() => setAttempt(value => value + 1), []);
  const put = useCallback((story: Story) => {
    records.current.set(story.id, story);
    revisions.current.set(story.id, { version: ++version.current, projectId: story.projectId!, story });
    setProjects(current => current.map(project => project.id === story.projectId ? {
      ...project, stories: [story, ...project.stories.filter(item => item.id !== story.id)].sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id)),
      changes: project.changes.filter(change => !story.sourceChangeIds?.includes(change.id)),
    } : project));
  }, [setProjects]);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    const startedAt = version.current;
    setStates(current => ({ ...current, [projectId]: { status: 'loading' } }));
    api.listStories(projectId, controller.signal).then(incoming => {
      if (controller.signal.aborted) return;
      const merged = new Map(incoming.map(story => [story.id, story]));
      for (const [id, change] of revisions.current) {
        if (change.projectId === projectId && change.version > startedAt) {
          if (change.story) merged.set(id, change.story); else merged.delete(id);
        }
      }
      const stories = [...merged.values()].sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));
      stories.forEach(story => records.current.set(story.id, story));
      setProjects(current => current.map(project => project.id === projectId ? { ...project, stories } : project));
      setStates(current => ({ ...current, [projectId]: { status: 'ready' } }));
    }).catch(error => {
      if (!controller.signal.aborted) setStates(current => ({ ...current, [projectId]: {
        status: 'error', error: error instanceof Error ? error.message : 'Story를 불러오지 못했어요.',
      } }));
    });
    return () => controller.abort();
  }, [projectId, attempt, setProjects]);

  const loadStory = useCallback(async (id: string, signal: AbortSignal) => {
    const startedAt = version.current;
    const story = await api.getStory(id, signal);
    signal.throwIfAborted();
    const recent = revisions.current.get(id);
    if (recent && recent.version > startedAt) {
      if (!recent.story) throw new Error('삭제된 Story입니다.');
      return recent.story;
    }
    put(story);
    return story;
  }, [put]);

  const createDraft = useCallback((project: string, fields: StoryFields, changes: Change[]) => {
    const key = JSON.stringify([project, changes.map(change => change.id).sort()]);
    const pending = creating.current.get(key);
    if (pending) return pending;
    const promise = api.createStory(project, fields, changes).then(story => { put(story); return story; });
    creating.current.set(key, promise);
    void promise.finally(() => { if (creating.current.get(key) === promise) creating.current.delete(key); }).catch(() => undefined);
    return promise;
  }, [put]);

  const enqueue = useCallback(<T,>(id: string, task: () => Promise<T>) => {
    const result = (queues.current.get(id) ?? Promise.resolve()).catch(() => undefined).then(task);
    queues.current.set(id, result);
    void result.finally(() => { if (queues.current.get(id) === result) queues.current.delete(id); }).catch(() => undefined);
    return result;
  }, []);
  const saveStory = useCallback((id: string, fields: Partial<StoryFields>, status?: api.ServerStoryStatus) => enqueue(id, async () => {
    const previous = records.current.get(id);
    if (!previous) throw new Error('Story를 다시 불러온 뒤 저장해주세요.');
    const saved = await api.updateStory(previous, fields, status);
    put(saved);
    return saved;
  }), [enqueue, put]);
  const deleteStory = useCallback((id: string) => enqueue(id, async () => {
    const previous = records.current.get(id);
    if (!previous) throw new Error('Story를 다시 불러온 뒤 삭제해주세요.');
    await api.deleteStory(id);
    records.current.delete(id);
    revisions.current.set(id, { version: ++version.current, projectId: previous.projectId!, story: null });
    setProjects(current => current.map(project => project.id === previous.projectId ? {
      ...project, stories: project.stories.filter(story => story.id !== id),
    } : project));
    return previous.projectId!;
  }), [enqueue, setProjects]);

  return { storyListState: projectId ? states[projectId] ?? { status: 'loading' as const } : { status: 'ready' as const },
    reloadStories, loadStory, createDraft, saveStory, deleteStory };
}

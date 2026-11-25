import { createContext, startTransition, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { type Analysis, type AnalysisMode, type Project, type Service, type StoryFields } from '../data/projects';
import * as projectApi from '../api/projects';
import { useGithubActivities } from './useGithubActivities';
import { syncNotionActivities } from '../api/externalActivities';
import { replaceServiceChanges, type ActivityState } from '../data/activity';

import { SessionSkeleton } from '../components/Skeleton';
import boundaryStyles from '../components/AuthBoundary.module.css';
import { useAuth } from './AuthContext';
import { Navigate } from 'react-router';
import { ApiError } from '../api/client';
import { clearAccessToken } from '../api/auth';
import { useFigmaActivities } from './useFigmaActivities';
import { useStoryStore } from './useStoryStore';
import { analyzeActivities, type ServerStoryStatus } from '../api/stories';
import { storyDraftFromAnalysis } from '../data/storyDraft';
import { readAnalysisDraft, removeAnalysisDraft, saveAnalysisDraft } from '../data/analysisDraft';

export type NewProject = { name: string; description: string; urls: Record<Service, string> };

const todaysChangeIds = (project: Project | undefined) => project?.changes.filter((change) => change.daysAgo === 0).slice(0, 20).map((change) => change.id) ?? [];

function useProjectsState() {
  const { user } = useAuth();
  const selectionKey = `moeum.active-project.${user.id}`;
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = mutationQueue.current.then(task, task);
    mutationQueue.current = result.catch(() => undefined);
    return result;
  }
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    projectApi.listProjects(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      const next = data.map(item => projectApi.toProject(item));
      setProjects(next);
      let remembered: string | null = null;
      try { remembered = sessionStorage.getItem(selectionKey); } catch { /* Selection storage is optional. */ }
      const id = next.find(project => project.id === remembered)?.id ?? next[0]?.id ?? null;
      const restored = id ? readAnalysisDraft(user.id, id) : null;
      setAnalysis(restored);
      setSelectedChangeIds(restored?.changeIds ?? []);
      setMode(restored?.mode ?? '의미 중심');
      setActiveProjectId(id);
    }).catch(error => {
      if (!controller.signal.aborted && error instanceof ApiError && error.status === 401) {
        clearAccessToken();
        setExpired(true);
      }
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : '프로젝트를 불러오지 못했습니다.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt, selectionKey, user.id]);
  useEffect(() => {
    if (loading || loadError) return;
    try {
      if (activeProjectId) sessionStorage.setItem(selectionKey, activeProjectId);
      else sessionStorage.removeItem(selectionKey);
    } catch { /* Selection storage is optional. */ }
  }, [activeProjectId, loading, loadError, selectionKey]);
  // 분석 수정 내용은 같은 탭에서 계정·프로젝트별로 복원합니다.
  const [selectedChangeIds, setSelectedChangeIds] = useState<string[]>([]);
  const [mode, setMode] = useState<AnalysisMode>('의미 중심');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisSaved, setAnalysisSaved] = useState(true);
  useEffect(() => {
    if (analysis) setAnalysisSaved(saveAnalysisDraft(user.id, analysis));
  }, [analysis, user.id]);
  const [storyDrafts, setStoryDrafts] = useState<Record<string, Record<string, Partial<StoryFields>>>>({});
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const storyStore = useStoryStore(activeProjectId, setProjects);
  const analysisRequest = useRef<AbortController | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  useEffect(() => () => analysisRequest.current?.abort(), []);
  useEffect(() => {
    analysisRequest.current?.abort();
    setAnalyzing(false);
    setAnalysisError('');
  }, [activeProjectId]);
  const figma = useFigmaActivities(user.id, activeProject, setProjects);
  const github = useGithubActivities(activeProject, setProjects);
  const githubSync = github.state;
  const refreshGithubChanges = github.refresh;
  const notionUrl = activeProject?.urls?.Notion;
  const notionKey = JSON.stringify([activeProjectId, notionUrl]);
  const [notionAttempt, setNotionAttempt] = useState(0);
  const [notion, setNotion] = useState<{ key: string; state: ActivityState }>();
  const notionState: ActivityState = !notionUrl ? { status: 'disconnected' } :
    notion?.key === notionKey ? notion.state : { status: 'loading' };
  const activityStates = { GitHub: github.state, Figma: figma.listState, Notion: notionState };
  function refreshActivities(service: Exclude<Service, 'Figma'>) {
    if (service === 'GitHub') github.refresh();
    else setNotionAttempt(value => value + 1);
  }
  useEffect(() => {
    if (!activeProjectId || !notionUrl) return;
    const controller = new AbortController();
    setNotion({ key: notionKey, state: { status: 'loading' } });
    syncNotionActivities({ projectId: activeProjectId, signal: controller.signal }).then(changes => {
      if (controller.signal.aborted) return;
      setProjects(items => items.map(item => item.id === activeProjectId && item.urls?.Notion === notionUrl
        ? replaceServiceChanges(item, 'Notion', changes) : item));
      setNotion({ key: notionKey, state: { status: 'ready' } });
    }).catch(error => {
      if (!controller.signal.aborted) setNotion({ key: notionKey, state: { status: 'error',
        error: error instanceof Error ? error.message : 'Notion 변경사항을 불러오지 못했어요.' } });
    });
    return () => controller.abort();
  }, [activeProjectId, notionUrl, notionKey, notionAttempt]);

  // 프로젝트와 출처 조합별로 입력한 필드만 보관해 다른 Story에 섞이지 않게 합니다.
  function draftKey(storyId?: string) {
    return JSON.stringify(storyId ? ['edit', storyId] : ['new', [...(analysis?.changeIds ?? [])].sort()]);
  }

  function getStoryDraft(storyId?: string) {
    return activeProjectId ? storyDrafts[activeProjectId]?.[draftKey(storyId)] : undefined;
  }

  function updateStoryDraft(fields: Partial<StoryFields>, storyId?: string) {
    if (!activeProjectId) return;
    const key = draftKey(storyId);
    setStoryDrafts((current) => ({
      ...current,
      [activeProjectId]: {
        ...current[activeProjectId],
        [key]: { ...current[activeProjectId]?.[key], ...fields },
      },
    }));
  }

  function clearStoryDraft(storyId?: string) {
    if (!activeProjectId) return;
    const key = draftKey(storyId);
    setStoryDrafts((current) => {
      const drafts = { ...current[activeProjectId] };
      delete drafts[key];
      return { ...current, [activeProjectId]: drafts };
    });
  }

  function updateActive(update: (project: Project) => Project) {
    setProjects((current) => current.map((project) => project.id === activeProjectId ? update(project) : project));
  }

  const selectProject = useCallback((id: string) => {
    if (id === activeProjectId) return;
    analysisRequest.current?.abort();
    try { sessionStorage.setItem(selectionKey, id); } catch { /* Selection storage is optional. */ }
    const restored = readAnalysisDraft(user.id, id);
    // 프로젝트와 라우터 이동을 함께 반영해 이전 분석 화면의 리다이렉트를 막습니다.
    startTransition(() => {
      setActiveProjectId(id);
      setSelectedChangeIds(restored?.changeIds ?? todaysChangeIds(projects.find((project) => project.id === id)));
      setMode(restored?.mode ?? '의미 중심');
      setAnalysis(restored);
      setAnalysisSaved(true);
    });
  }, [activeProjectId, projects, selectionKey, user.id]);

  async function createProject({ name, description, urls }: NewProject) {
    const data = await projectApi.createProject({ project_name: name, description,
      github_url: urls.GitHub || null, figma_url: urls.Figma || null, notion_url: urls.Notion || null });
    const project = projectApi.toProject(data);
    setProjects((current) => [project, ...current]);
    setActiveProjectId(project.id);
    setSelectedChangeIds([]);
    setMode('의미 중심');
    setAnalysis(null);
  }

  async function updateProject(fields: Partial<Pick<Project, 'name' | 'description'>> & Partial<Pick<projectApi.ProjectInput, 'github_url' | 'figma_url' | 'notion_url'>>) {
    if (!activeProjectId) throw new Error('프로젝트를 선택해주세요.');
    const { name, ...rest } = fields;
    const id = activeProjectId;
    await enqueue(async () => {
      const data = await projectApi.updateProject(id, { ...rest, ...(name === undefined ? {} : { project_name: name }) });
      setProjects(current => current.map(project => project.id === String(data.id) ? projectApi.toProject(data, project) : project));
    });
  }

  async function saveConnection(service: Service, url: string | null) {
    const id = activeProjectId;
    if (!id) throw new Error('프로젝트를 선택해주세요.');
    return enqueue(async () => {
      const { connections } = await projectApi.saveConnection(id, service, url);
      const urlFor = (name: string) => connections.find(item => item.source === name)?.external_url ?? '';
      const urls = { GitHub: urlFor('github'), Notion: urlFor('notion'), Figma: urlFor('figma') };
      setProjects(current => current.map(project => project.id === id
        ? { ...project, ...projectApi.projectLinks(urls, project) } : project));
      return connections;
    });
  }

  async function deleteProject() {
    if (!activeProjectId) throw new Error('프로젝트를 선택해주세요.');
    await enqueue(() => projectApi.deleteProject(activeProjectId));
    removeAnalysisDraft(user.id, activeProjectId);
    if (activeProjectId) {
      setStoryDrafts((current) => {
        const next = { ...current };
        delete next[activeProjectId];
        return next;
      });
    }
    const remaining = projects.filter((project) => project.id !== activeProjectId);
    setProjects(current => current.filter(project => project.id !== activeProjectId));
    setActiveProjectId(remaining[0]?.id ?? null);
    setSelectedChangeIds(todaysChangeIds(remaining[0]));
    setMode('의미 중심');
    setAnalysis(null);
  }

  function selectRepository(repository: string) {
    // 최초 확정 후에는 UI 이외의 호출로도 선택을 덮어쓰지 않습니다.
    updateActive((project) => project.selectedRepository || !project.repositories.includes(repository)
      ? project
      : { ...project, selectedRepository: repository });
  }

  function toggleChange(id: string) {
    if (analyzing) return;
    setSelectedChangeIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 20 ? [...current, id] : current);
  }

  const cancelAnalysis = useCallback(() => {
    analysisRequest.current?.abort();
    setAnalyzing(false);
  }, []);
  async function analyze(changeIds = selectedChangeIds) {
    const projectId = activeProjectId;
    if (!projectId) return null;
    const changes = activeProject?.changes.filter(change => changeIds.includes(change.id)) ?? [];
    const controller = new AbortController();
    analysisRequest.current?.abort();
    analysisRequest.current = controller;
    setAnalyzing(true);
    setAnalysisError('');
    try {
      const result = { ...await analyzeActivities(projectId, changes, controller.signal, mode), changeIds, projectId, mode };
      if (controller.signal.aborted) return null;
      setSelectedChangeIds(changeIds);
      setAnalysis(result);
      return result;
    } catch (error) {
      if (!controller.signal.aborted) setAnalysisError(error instanceof Error ? error.message : 'AI 분석에 실패했어요. 다시 시도해주세요.');
      return null;
    } finally {
      if (analysisRequest.current === controller) setAnalyzing(false);
    }
  }
  function updateAnalysis(fields: Partial<Omit<Analysis, 'changeIds' | 'mode'>>) {
    setAnalysis(current => current && { ...current, ...fields });
  }
  const clearAnalysis = useCallback(() => {
    analysisRequest.current?.abort();
    if (activeProjectId) removeAnalysisDraft(user.id, activeProjectId);
    setAnalysis(null);
    setAnalysisSaved(true);
  }, [activeProjectId, user.id]);
  async function createStoryDraft(fields?: StoryFields) {
    if (!activeProject) throw new Error('프로젝트를 선택해주세요.');
    const selected = !fields && analysis?.projectId === activeProject.id ? analysis : null;
    const changes = selected ? activeProject.changes.filter(change => selected.changeIds.includes(change.id)) : [];
    if (selected && changes.length !== selected.changeIds.length) throw new Error('선택한 변경사항이 달라졌어요. 변경사항을 다시 선택해주세요.');
    const values = fields ?? storyDraftFromAnalysis(selected);
    const story = await storyStore.createDraft(activeProject.id, values, changes);
    startTransition(() => {
      setSelectedChangeIds([]);
      if (selected) clearAnalysis();
    });
    return story.id;
  }
  async function saveStory(fields: Partial<StoryFields>, id: string, status?: ServerStoryStatus) {
    const projectId = activeProjectId;
    const key = draftKey(id);
    const story = await storyStore.saveStory(id, fields, status);
    // An older response must not erase typing that happened while its request was running.
    if (projectId) setStoryDrafts(current => {
      const draft = { ...current[projectId]?.[key] };
      for (const field of Object.keys(fields) as (keyof StoryFields)[]) {
        if (JSON.stringify(draft[field]) === JSON.stringify(fields[field])) delete draft[field];
      }
      return { ...current, [projectId]: { ...current[projectId], [key]: draft } };
    });
    return story.id;
  }
  async function deleteStory(id: string) {
    const projectId = await storyStore.deleteStory(id);
    clearStoryDraft(id);
    // Service loaders expose any refresh failure without undoing a successful deletion.
    if (projectId === activeProjectId) {
      refreshActivities('GitHub');
      refreshActivities('Notion');
      figma.reload();
    }
  }

  return {
    ...storyStore, createStoryDraft, analyzing, analysisError, cancelAnalysis,
    loading, loadError, expired, retry: () => setAttempt(value => value + 1),
    projects,
    activeProject,
    saveConnection, githubCommits: github.commits, githubSync, refreshGithubChanges, activityStates, refreshActivities, figma,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    selectRepository,
    selectedChangeIds,
    toggleChange,
    mode,
    setMode,
    analysis,
    analysisSaved,
    analyze,
    updateAnalysis,
    clearAnalysis,
    getStoryDraft,
    updateStoryDraft,
    saveStory,
    deleteStory,
  };
}

const ProjectsContext = createContext<ReturnType<typeof useProjectsState> | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const value = useProjectsState();
  if (value.expired) return <Navigate to="/login" replace />;
  if (value.loading) return <SessionSkeleton />;
  if (value.loadError) return <main className={boundaryStyles.loading}>
    <p role="alert">{value.loadError}</p><button type="button" onClick={value.retry}>다시 시도</button>
  </main>;
  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const value = useContext(ProjectsContext);
  if (!value) throw new Error('ProjectsProvider가 필요합니다.');
  return value;
}

// Always resolve the route ID from the server, including after a reload or cross-project link.
export function useStory(storyId: string | undefined) {
  const { projects, activeProject, selectProject, loadStory } = useProjects();
  const [state, setState] = useState<{ id?: string; status: 'loading' | 'ready' | 'error'; error?: string }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const select = useRef(selectProject);
  select.current = selectProject;
  useEffect(() => {
    if (!storyId) return;
    const controller = new AbortController();
    setState({ id: storyId, status: 'loading' });
    loadStory(storyId, controller.signal).then(story => {
      if (controller.signal.aborted) return;
      select.current(story.projectId!);
      setState({ id: storyId, status: 'ready' });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ id: storyId, status: 'error', error: error instanceof Error ? error.message : 'Story를 불러오지 못했어요.' });
    });
    return () => controller.abort();
  }, [storyId, attempt, loadStory]);
  const story = projects.flatMap(project => project.stories).find(item => item.id === storyId);
  return { story, switching: Boolean(storyId) && (state.id !== storyId || state.status === 'loading' || (state.status === 'ready' && story?.projectId !== activeProject?.id)),
    error: state.id === storyId && state.status === 'error' ? state.error : '', retry: () => setAttempt(value => value + 1) };
}

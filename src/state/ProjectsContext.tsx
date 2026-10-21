import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createAnalysis, todayLabel, type Analysis, type AnalysisMode, type Project, type Service, type Story, type StoryFields } from '../data/projects';
import * as projectApi from '../api/projects';
import { SessionSkeleton } from '../components/Skeleton';
import boundaryStyles from '../components/AuthBoundary.module.css';
import { useAuth } from './AuthContext';
import { Navigate } from 'react-router';
import { ApiError } from '../api/client';
import { clearAccessToken } from '../api/auth';

export type NewProject = { name: string; description: string; urls: Record<Service, string> };

const todaysChangeIds = (project: Project | undefined) => project?.changes.filter((change) => change.daysAgo === 0).map((change) => change.id) ?? [];

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
      setActiveProjectId(next.find(project => project.id === remembered)?.id ?? next[0]?.id ?? null);
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
  }, [attempt, selectionKey]);
  useEffect(() => {
    if (loading || loadError) return;
    try {
      if (activeProjectId) sessionStorage.setItem(selectionKey, activeProjectId);
      else sessionStorage.removeItem(selectionKey);
    } catch { /* Selection storage is optional. */ }
  }, [activeProjectId, loading, loadError, selectionKey]);
  // s5에서 고른 변경사항과 분석 방식, s6 분석 결과. 프로젝트를 바꾸면 초기화됩니다.
  const [selectedChangeIds, setSelectedChangeIds] = useState<string[]>([]);
  const [mode, setMode] = useState<AnalysisMode>('의미 중심');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [storyDrafts, setStoryDrafts] = useState<Record<string, Record<string, Partial<StoryFields>>>>({});
  const activeProject = projects.find((project) => project.id === activeProjectId);

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

  function selectProject(id: string) {
    if (id === activeProjectId) return;
    setActiveProjectId(id);
    setSelectedChangeIds(todaysChangeIds(projects.find((project) => project.id === id)));
    setMode('의미 중심');
    setAnalysis(null);
  }

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

  async function deleteProject() {
    if (!activeProjectId) throw new Error('프로젝트를 선택해주세요.');
    await enqueue(() => projectApi.deleteProject(activeProjectId));
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
    setSelectedChangeIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  // s5 "AI Story 분석", s6 변경사항 제외: 주어진(기본값은 현재 선택한) 변경사항으로 분석 결과를 만들고 반환합니다.
  function analyze(changeIds = selectedChangeIds) {
    const changes = activeProject?.changes.filter((change) => changeIds.includes(change.id)) ?? [];
    if (!changes.length) return null;
    setSelectedChangeIds(changeIds);
    const result = createAnalysis(changes, mode);
    setAnalysis(result);
    return result;
  }

  function updateAnalysis(fields: Partial<Omit<Analysis, 'changeIds' | 'mode'>>) {
    setAnalysis((current) => current && { ...current, ...fields });
  }

  function clearAnalysis() {
    setAnalysis(null);
  }

  // s7 "Story 작성 완료": id가 있으면 수정, 없으면 분석 결과를 출처로 새 Story를 만듭니다. 저장한 Story의 id를 반환합니다.
  function saveStory(fields: StoryFields, id?: string) {
    clearStoryDraft(id);
    const existing = activeProject?.stories.find((story) => story.id === id);
    if (existing) {
      updateActive((project) => ({ ...project, stories: project.stories.map((story) => story.id === existing.id ? { ...story, ...fields, status: '완료' } : story) }));
      return existing.id;
    }
    const sources = [...new Set(activeProject?.changes.filter((change) => analysis?.changeIds.includes(change.id)).map((change) => change.service))];
    const story: Story = { ...fields, id: crypto.randomUUID(), status: '완료', sources, date: todayLabel() };
    updateActive((project) => ({
      ...project,
      stories: [story, ...project.stories],
      changes: project.changes.filter((change) => !analysis?.changeIds.includes(change.id)),
    }));
    setSelectedChangeIds([]);
    setAnalysis(null);
    return story.id;
  }

  function deleteStory(id: string) {
    clearStoryDraft(id);
    updateActive((project) => ({ ...project, stories: project.stories.filter((story) => story.id !== id) }));
  }

  return {
    loading, loadError, expired, retry: () => setAttempt(value => value + 1),
    projects,
    activeProject,
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

// /stories/:id 로 Story를 찾습니다. 다른 프로젝트의 Story면 그 프로젝트로 바꾸고, 바꾸는 동안 switching이 true입니다.
export function useStory(storyId: string | undefined) {
  const { projects, activeProject, selectProject } = useProjects();
  const story = activeProject?.stories.find((item) => item.id === storyId);
  const ownerId = story ? undefined : projects.find((project) => project.stories.some((item) => item.id === storyId))?.id;
  useEffect(() => {
    if (ownerId) selectProject(ownerId);
  }, [ownerId, selectProject]);
  return { story, switching: ownerId !== undefined };
}

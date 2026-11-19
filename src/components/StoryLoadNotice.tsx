import { useProjects } from '../state/ProjectsContext';
import ui from './ui.module.css';
export function StoryLoadNotice() {
  const { storyListState, reloadStories } = useProjects();
  if (storyListState.status === 'loading') return <p role="status">Story를 불러오는 중이에요…</p>;
  if (storyListState.status === 'error') return <div role="alert"><p>{storyListState.error}</p><button type="button" className={ui.secondaryButton} onClick={reloadStories}>Story 다시 불러오기</button></div>;
  return null;
}

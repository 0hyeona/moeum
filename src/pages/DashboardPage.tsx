import { StoryLoadNotice } from '../components/StoryLoadNotice';
import { FigmaLiveConnection } from '../components/FigmaLiveConnection';
import { useRef, useState } from 'react';
import { startNotionConnection } from '../api/notion';
import { needsNotionConnection } from '../data/notionConnectionState';
import { Link, Navigate } from 'react-router';
import type { ActivityState } from '../data/activity';
import { services, type Service } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { StoryCard } from '../components/StoryCard';
import { GitHubActivity } from '../components/GitHubActivity';
import { ServiceIcon, useDocumentTitle } from '../components/ui';
import ui from '../components/ui.module.css';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  useDocumentTitle('대시보드');
  const { activeProject: project, storyListState, githubCommits, activityStates, refreshActivities } = useProjects();
  if (!project) return <Navigate to="/projects" replace />;

  return (
    <div className={styles.page}>
      <h1 className={ui.visuallyHidden}>{project.name} 대시보드</h1>
      <div className={styles.topRow}>
        <section className={styles.panel} aria-labelledby="pending-heading">
          <div className={`${styles.panelHeader} ${styles.pendingHeader}`}>
            <div>
              <h2 id="pending-heading">미정리 변경사항</h2>
              <p>Story로 정리할 변경사항을 서비스별로 확인해 보세요.</p>
            </div>
            <Link to="/changes?period=all">변경사항 전체 보기</Link>
          </div>
          <ul className={styles.stats}>
            {services.map(service => {
              const state = activityStates[service];
              const count = project.changes.filter(change => change.service === service).length;
              return (
                <li key={service} className={styles.stat} data-service={service}>
                  <span className={styles.statService}>
                    <span className={styles.statIcon}><ServiceIcon service={service} size={18} /></span>
                    {service}
                  </span>
                  <span className={styles.count} aria-label={`${service} 미정리 변경사항 ${count}개`}><strong>{count}</strong>개</span>
                  <div className={styles.serviceControls}>
                    {service === 'Figma' ? (project.urls?.Figma ? <FigmaLiveConnection
                      key={`${project.id}:${project.urls.Figma}`} projectId={project.id} fileUrl={project.urls.Figma} />
                      : <div className={styles.connectionSummary}>
                        <p className={styles.connectionStatus} role="status">미연결</p>
                        <Link className={styles.statButton} to="/settings#settings-url-Figma">실시간 연결 관리</Link>
                        <p className={styles.connectionHint}>변경사항을 받으려면 Figma 파일을 등록해주세요.</p>
                      </div>) : <ServiceConnectionControls service={service} state={state}
                        connected={project.services[service].status === 'connected'}
                        reconnect={project.services[service].status === 'reconnect'}
                        hasUrl={Boolean(project.urls?.[service])}
                        onRefresh={() => refreshActivities(service)} />}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className={styles.pendingFooter}>
            <Link to="/changes?period=all" className={`${ui.primaryButton} ${styles.storyButton}`}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
              Story 만들기
            </Link>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="story-heading">
          <div className={styles.panelHeader}>
            <h2 id="story-heading">최근 Story</h2>
            <Link to="/timeline">타임라인 보기</Link>
          </div>
          <StoryLoadNotice />
          {project.stories.length > 0 ? (
            <ul className={styles.stories}>
              {project.stories.slice(0, 3).map((story) => <li key={story.id}><StoryCard story={story} className={styles.storyCard} /></li>)}
            </ul>
          ) : storyListState.status === 'ready' ? (
            <p className={styles.empty}>아직 작성된 Story가 없어요.</p>
          ) : null}
        </section>

      </div>

      <div className={styles.bottomRow}>
        <GitHubActivity state={activityStates.GitHub} commits={githubCommits} onRefresh={() => refreshActivities('GitHub')} key={project.id} url={project.urls?.GitHub ?? ''} />
      </div>
    </div>
  );
}

function NotionConnectAction() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function connect() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await startNotionConnection('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Notion 승인 화면을 열지 못했어요.');
      busy.current = false;
      setPending(false);
    }
  }

  return <>
    <button type="button" className={styles.statButton} disabled={pending} onClick={() => void connect()}>
      {pending ? '연결 화면 여는 중…' : '연결 관리'}
    </button>
    {error && <p className={styles.statError} role="alert">{error}</p>}
  </>;
}

function ServiceConnectionControls({ service, state, connected, reconnect, hasUrl, onRefresh }: {
  service: Exclude<Service, 'Figma'>;
  state: ActivityState;
  connected: boolean;
  reconnect: boolean;
  hasUrl: boolean;
  onRefresh: () => void;
}) {
  const needsApproval = service === 'Notion' && hasUrl && needsNotionConnection(state);
  const needsReconnect = hasUrl && (needsApproval || reconnect);
  const failed = state.status === 'error';
  const loading = state.status === 'loading' || state.status === 'pending';
  const canRefreshNotion = service === 'Notion' && hasUrl && !needsReconnect && (connected || state.status === 'ready');
  const status = !hasUrl ? '미연결' : needsReconnect ? '재연결 필요'
    : loading ? '' : failed ? '조회 실패' : connected ? '연결 중' : '미연결';
  const hint = !hasUrl ? `변경사항을 받으려면 ${service === 'GitHub' ? '저장소' : 'Notion 페이지'}를 등록해주세요.`
    : needsReconnect ? '변경사항을 받으려면 다시 연결해주세요.'
    : failed ? '변경사항을 가져오지 못했어요. 다시 시도하거나 연결을 확인해주세요.'
    : service === 'GitHub' ? '저장소 연결과 접근 권한을 관리해요.'
    : canRefreshNotion ? '새로고침하면 최신 변경사항을 가져와요.' : '변경사항을 받으려면 Notion 페이지를 연결해주세요.';

  return <div className={styles.connectionSummary}>
    {status && <p className={styles.connectionStatus} data-state={needsReconnect || failed ? 'error' : status === '연결 중' ? 'connected' : undefined} role="status">{status}</p>}
    <div className={styles.connectionActions}>
      {canRefreshNotion ? <button type="button" className={styles.statButton} disabled={loading}
        onClick={onRefresh} aria-label="Notion 새로고침">{loading ? '수집 중…' : '새로고침'}</button>
        : needsApproval ? <NotionConnectAction /> : <Link className={styles.statButton}
          aria-label={`${service} 연결 관리`} to={`/settings#${service.toLowerCase()}-account`}>연결 관리</Link>}
      {service === 'GitHub' && hasUrl && !needsReconnect && failed && <button type="button"
        className={styles.refreshButton} disabled={loading} onClick={onRefresh}
        aria-label={`${service} ${failed ? '다시 시도' : '새로고침'}`}>
        {loading ? '수집 중…' : failed ? '다시 시도' : '새로고침'}
      </button>}
    </div>
    <p className={styles.connectionHint}>{hint}</p>
    {failed && !needsReconnect && <p className={styles.statError} role="alert">{state.error}</p>}
  </div>;
}

import { Link, Navigate } from 'react-router';
import { services, type ServiceState } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { StoryCard } from '../components/StoryCard';
import { Badge, ServiceIcon, useDocumentTitle } from '../components/ui';
import form from '../components/form.module.css';
import ui from '../components/ui.module.css';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  useDocumentTitle('대시보드');
  const { activeProject: project, selectRepository } = useProjects();
  if (!project) return <Navigate to="/projects" replace />;

  return (
    <div className={styles.page}>
      <h1 className={ui.visuallyHidden}>{project.name} 대시보드</h1>
      <div className={styles.topRow}>
        <section className={`${styles.panel} ${styles.pending}`} aria-labelledby="pending-heading">
          <div className={styles.panelHeader}>
            <h2 id="pending-heading">미정리 변경사항 조회</h2>
            <Link to="/changes?period=all">변경사항 전체 보기</Link>
          </div>
          <ul className={styles.stats}>
            {services.map((service) => (
              <li key={service} className={styles.stat}>
                <span className={styles.statService}>
                  <ServiceIcon service={service} />
                  {service}
                </span>
                <PendingCount state={project.services[service]} count={project.changes.filter((change) => change.service === service).length} />
              </li>
            ))}
          </ul>
          <Link to="/changes" className={`${ui.primaryButton} ${styles.storyButton}`}>Story 만들기</Link>
        </section>

        <section className={`${styles.panel} ${styles.repositories}`} aria-labelledby="repository-heading">
          <h2 id="repository-heading">Repository 선택</h2>
          {project.repositories.length > 0 ? (
            <div className={styles.repositoryList} role="radiogroup" aria-labelledby="repository-heading">
              {project.repositories.map((repository) => (
                <label key={repository} className={styles.repository}>
                  <input type="radio" name="repository" className={form.radio} value={repository} checked={project.selectedRepository === repository} onChange={() => selectRepository(repository)} />
                  <span>{repository}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>연결된 Repository가 없어요.</p>
          )}
        </section>
      </div>

      <div className={styles.bottomRow}>
        <section className={styles.panel} aria-labelledby="story-heading">
          <div className={styles.panelHeader}>
            <h2 id="story-heading">최근 Story</h2>
            <Link to="/timeline">타임라인 보기</Link>
          </div>
          {project.stories.length > 0 ? (
            <ul className={styles.stories}>
              {project.stories.slice(0, 3).map((story) => <li key={story.id}><StoryCard story={story} /></li>)}
            </ul>
          ) : (
            <p className={styles.empty}>아직 작성된 Story가 없어요.</p>
          )}
        </section>

        <section className={`${styles.panel} ${styles.commits}`} aria-labelledby="commit-heading">
          <div className={styles.panelHeader}>
            <h2 id="commit-heading">최근 GitHub 변경사항</h2>
            <Link to="/changes?service=GitHub">변경사항 전체 보기</Link>
          </div>
          {project.commits.length > 0 ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <colgroup>
                  <col className={styles.narrowColumn} />
                  <col className={styles.messageColumn} />
                  <col className={styles.narrowColumn} />
                  <col className={styles.narrowColumn} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">커밋 기록</th>
                    <th scope="col">커밋 메시지</th>
                    <th scope="col">날짜</th>
                    <th scope="col">변경사항</th>
                    <th scope="col">푸시/머지 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {project.commits.map((commit) => (
                    <tr key={commit.sha}>
                      <td>{commit.sha}</td>
                      <td title={commit.message}>{commit.message}</td>
                      <td>{commit.date}</td>
                      <td>
                        <span className={styles.additions}>+{commit.additions}</span>{' '}
                        <span className={styles.deletions}>-{commit.deletions}</span>
                      </td>
                      <td><Badge>{commit.state}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.empty}>아직 수집된 GitHub 변경사항이 없어요.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function PendingCount({ state, count }: { state: ServiceState; count: number }) {
  if (state.status === 'connected') {
    return <span className={styles.count}><strong>{count}</strong>개</span>;
  }
  if (state.status === 'reconnect') return <span className={styles.alert}>재연결필요</span>;
  return <span className={styles.muted}>미연결</span>;
}

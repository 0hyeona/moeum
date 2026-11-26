import { useState } from 'react';
import { Link } from 'react-router';
import type { StoredCommit } from '../api/activities';
import type { ActivityState } from '../data/activity';
import { ServiceIcon } from './ui';
import ui from './ui.module.css';
import styles from '../pages/DashboardPage.module.css';

type Props = { url: string; state: ActivityState; commits: StoredCommit[]; onRefresh: () => void };

export function GitHubActivity(props: Props) {
  const { url } = props;
  return (
    <section className={`${styles.panel} ${styles.commits}`} aria-labelledby="commit-heading">
      {!url.trim() ? <>
        <div className={styles.panelHeader}><h2 id="commit-heading">최근 GitHub 변경사항</h2></div>
        <div className={styles.githubEmpty}>
          <ServiceIcon service="GitHub" size={32} />
          <strong>GitHub 저장소를 연결해보세요</strong>
          <p>저장소를 연결하면 브랜치별 최근 커밋과 변경 내용을 확인할 수 있어요.</p>
          <Link to="/settings#settings-url-GitHub" className={ui.primaryButton}>설정에서 연결하기</Link>
        </div>
      </> : <ConnectedActivity key={url} {...props} />}
    </section>
  );
}

function ConnectedActivity({ url, state, commits, onRefresh }: Props) {
  const [branch, setBranch] = useState('');
  const branches = [...new Set(commits.flatMap(commit => commit.branch ? [commit.branch] : []))];
  const selectedBranch = branches.includes(branch) ? branch : '';
  const recent = commits.filter(commit => !selectedBranch || commit.branch === selectedBranch).slice(0, 5);
  const repositoryUrl = url.trim().replace(/\/?$/, '').replace(/\.git$/, '');
  const historyUrl = selectedBranch ? repositoryUrl + '/commits/' + encodeURIComponent(selectedBranch) : repositoryUrl;
  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.error : '';

  return <>
    <div className={styles.panelHeader}>
      <h2 id="commit-heading">최근 GitHub 변경사항</h2>
      <div className={styles.githubActions}>
        <button type="button" className={styles.refreshButton} disabled={loading} onClick={onRefresh}>새로고침</button>
        {repositoryUrl && commits.length > 0 && <a href={historyUrl} target="_blank" rel="noreferrer">GitHub에서 전체 보기</a>}
      </div>
    </div>
    {branches.length > 0 && <div className={styles.branches} role="group" aria-label="브랜치 필터">
      {['', ...branches].map(branch => <button key={branch} type="button" className={styles.branch}
        aria-pressed={selectedBranch === branch} onClick={() => setBranch(branch)}>{branch || '전체'}</button>)}
    </div>}
    {error && <div className={styles.githubEmpty}>
      <p role="alert">{error}</p>
      {commits.length > 0 && <p>저장된 기록은 계속 볼 수 있어요. 최신 변경사항은 다음 새로고침에서 확인하세요.</p>}
      <div className={styles.githubActions}>
        <button type="button" className={ui.primaryButton} onClick={onRefresh}>다시 시도</button>
        <Link to="/settings#settings-url-GitHub">연결 설정 확인</Link>
      </div>
    </div>}
    {loading && !recent.length ? null
      : !recent.length ? !error && <p className={styles.empty} role="status">{selectedBranch ? `${selectedBranch} 브랜치에 아직 커밋이 없어요.` : '저장된 GitHub 변경사항이 없어요. 새로고침을 눌러 커밋을 가져오세요.'}</p>
        : <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className={ui.visuallyHidden}>{selectedBranch || '전체'} 최근 커밋 5개</caption>
              <colgroup><col className={styles.narrowColumn} /><col className={styles.messageColumn} /><col className={styles.narrowColumn} /><col /></colgroup>
              <thead><tr><th scope="col">커밋 기록</th><th scope="col">커밋 메시지</th><th scope="col">날짜</th><th scope="col">브랜치</th></tr></thead>
              <tbody>{recent.map(commit => <tr key={commit.sha}>
                <td><a className={styles.commitLink} href={`${repositoryUrl}/commit/${encodeURIComponent(commit.sha)}`} target="_blank" rel="noreferrer">{commit.sha.slice(0, 7)}</a></td>
                <td title={commit.message}>{commit.message.split('\n')[0]}</td>
                <td>{commit.date ? <time dateTime={commit.date} title={new Date(commit.date).toLocaleString('ko-KR')}>{new Date(commit.date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}</time> : '—'}</td>
                <td>{commit.branch ?? '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
  </>;
}

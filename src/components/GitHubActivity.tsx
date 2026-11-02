import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { loadGitHubRepository, loadGitHubCommits, type GitHubRepository, type GitHubCommit } from '../api/github';
import { Badge, ServiceIcon } from './ui';
import ui from './ui.module.css';
import styles from '../pages/DashboardPage.module.css';

export function GitHubActivity({ url, onRefresh }: { url: string; onRefresh?: () => void }) {
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
      </> : <ConnectedActivity key={url} url={url} onRefresh={onRefresh} />}
    </section>
  );
}

type RepositoryState = { data?: GitHubRepository; error?: string };
type CommitState = { branch: string; data?: GitHubCommit[]; error?: string };

function ConnectedActivity({ url, onRefresh }: { url: string; onRefresh?: () => void }) {
  const [repository, setRepository] = useState<RepositoryState>({});
  const [selectedBranch, setSelectedBranch] = useState('');
  const [commits, setCommits] = useState<CommitState>({ branch: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRepository({});
    loadGitHubRepository(url, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setRepository({ data });
      setSelectedBranch(current => data.branches.includes(current) ? current : data.branches[0] ?? '');
    }).catch(error => {
      if (!controller.signal.aborted) setRepository({ error: error instanceof Error ? error.message : '저장소를 불러오지 못했어요.' });
    });
    return () => controller.abort();
  }, [url, attempt]);

  useEffect(() => {
    if (!repository.data || !selectedBranch || !repository.data.branches.includes(selectedBranch)) return;
    const controller = new AbortController();
    setCommits({ branch: selectedBranch });
    loadGitHubCommits(url, selectedBranch, controller.signal).then(data => {
      if (!controller.signal.aborted) setCommits({ branch: selectedBranch, data });
    }).catch(error => {
      if (!controller.signal.aborted) setCommits({ branch: selectedBranch, error: error instanceof Error ? error.message : '커밋을 불러오지 못했어요.' });
    });
    return () => controller.abort();
  }, [url, repository.data, selectedBranch]);

  const hasBranches = Boolean(repository.data?.branches.length);
  const current = commits.branch === selectedBranch ? commits : { branch: selectedBranch };
  const error = repository.error ?? (hasBranches ? current.error : undefined);
  const loading = !error && (!repository.data || (hasBranches && !current.data));
  const repositoryUrl = repository.data ? `https://github.com/${repository.data.name}` : '';
  const historyUrl = `${repositoryUrl}/commits/${encodeURIComponent(selectedBranch)}`;

  return <>
    <div className={styles.panelHeader}>
      <h2 id="commit-heading">최근 GitHub 변경사항</h2>
      <div className={styles.githubActions}>
        <button type="button" className={styles.refreshButton} disabled={loading} onClick={() => { setAttempt(value => value + 1); onRefresh?.(); }}>새로고침</button>
        {repositoryUrl && hasBranches && <a href={historyUrl} target="_blank" rel="noreferrer">GitHub에서 전체 보기</a>}
      </div>
    </div>
    {repository.data && hasBranches && <div className={styles.branches} role="group" aria-label="브랜치 필터">
      {repository.data.branches.map(branch => <button key={branch} type="button" className={styles.branch}
        aria-pressed={selectedBranch === branch} onClick={() => setSelectedBranch(branch)}>{branch}</button>)}
    </div>}
    {error ? <div className={styles.githubEmpty}>
      <p role="alert">{error}</p>
      <div className={styles.githubActions}>
        <button type="button" className={ui.primaryButton} onClick={() => { setAttempt(value => value + 1); onRefresh?.(); }}>다시 시도</button>
        <Link to="/settings#settings-url-GitHub">연결 설정 확인</Link>
      </div>
    </div> : loading ? <p className={styles.empty} role="status">GitHub 기록을 불러오는 중이에요…</p>
      : !hasBranches || !current.data?.length ? <p className={styles.empty} role="status">{selectedBranch ? `${selectedBranch} 브랜치에 아직 커밋이 없어요.` : '아직 커밋이 없는 저장소예요. 첫 커밋을 올린 뒤 새로고침해주세요.'}</p>
        : <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className={ui.visuallyHidden}>{selectedBranch} 브랜치의 최근 커밋 5개</caption>
              <colgroup><col className={styles.narrowColumn} /><col className={styles.messageColumn} /><col className={styles.narrowColumn} /><col className={styles.narrowColumn} /><col /></colgroup>
              <thead><tr><th scope="col">커밋 기록</th><th scope="col">커밋 메시지</th><th scope="col">날짜</th><th scope="col">변경사항</th><th scope="col">커밋 유형</th></tr></thead>
              <tbody>{current.data.map(commit => <tr key={commit.sha}>
                <td><a className={styles.commitLink} href={`${repositoryUrl}/commit/${encodeURIComponent(commit.sha)}`} target="_blank" rel="noreferrer">{commit.sha.slice(0, 7)}</a></td>
                <td title={commit.message}>{commit.message.split('\n')[0]}</td>
                <td>{commit.date ? <time dateTime={commit.date} title={new Date(commit.date).toLocaleString('ko-KR')}>{new Date(commit.date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}</time> : '—'}</td>
                <td>{commit.additions !== null && commit.deletions !== null ? <><span className={styles.additions}>+{commit.additions}</span>{' '}<span className={styles.deletions}>-{commit.deletions}</span></> : <span title="변경 줄 수를 불러오지 못했어요">—</span>}</td>
                <td><Badge>{commit.merged ? '머지 커밋' : '커밋'}</Badge></td>
              </tr>)}</tbody>
            </table>
          </div>
          {current.data.some(commit => commit.additions === null) && <p className={styles.githubNote}>일부 커밋의 변경 줄 수를 불러오지 못했어요. 커밋 링크에서 자세히 확인할 수 있어요.</p>}
        </>}
  </>;
}

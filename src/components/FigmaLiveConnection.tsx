import { useEffect, useRef, useState } from 'react';
import { createFigmaPairing, disconnectFigmaPlugin, getFigmaPluginStatus, type FigmaPairing, type FigmaPluginStatus } from '../api/figmaPlugin';
import { figmaLiveState, remainingTime } from '../data/figmaLiveState';
import ui from './ui.module.css';
import styles from './FigmaLiveConnection.module.css';

type Props = { projectId: string; fileUrl: string; onEnabled?: (enabled: boolean) => void };
const messages = {
  idle: ['연결 준비', '아래 1단계부터 차례로 진행해 주세요. 플러그인 설치는 처음 한 번만 하면 돼요.'],
  waiting: ['플러그인 연결 대기', 'Figma 플러그인에 연결 코드와 파일 공유 링크를 입력해 주세요.'],
  baseline: ['연결 성공 · 첫 전송 대기', '플러그인이 연결됐어요. 첫 비교 기준을 저장하고 있어요.'],
  connected: ['연결 성공 · 전송 확인', '첫 전송은 비교 기준이에요. 이제 Figma를 수정하면 변경사항을 모아요.'],
  expired: ['실시간 연결 만료', '8시간 연결이 만료됐어요. 새 코드를 만든 뒤 플러그인에서 다시 연결해 주세요.'],
  'code-expired': ['연결 코드 만료', '10분 안에 사용하지 않은 코드예요. 새 연결 코드를 생성해 주세요.'],
};

export function FigmaLiveConnection({ projectId, fileUrl, onEnabled }: Props) {
  return <FigmaLiveConnectionView key={`${projectId}:${fileUrl}`} projectId={projectId} fileUrl={fileUrl} onEnabled={onEnabled} />;
}

function FigmaLiveConnectionView({ projectId, fileUrl, onEnabled }: Props) {
  const connectionId = `figma-live-${projectId}`;
  const [connection, setConnection] = useState<FigmaPluginStatus>();
  const [pairing, setPairing] = useState<FigmaPairing>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const error = actionError || statusError;
  const [copied, setCopied] = useState('');
  const [now, setNow] = useState(Date.now);
  const [revision, setRevision] = useState(0);
  const operation = useRef(0);
  const working = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const state = figmaLiveState(connection, pairing, now);
  const codeUsable = state === 'waiting' && Boolean(pairing);

  useEffect(() => () => { operation.current++; }, []);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { document.body.style.overflow = previous; window.clearInterval(timer); };
  }, [open]);

  function close() {
    dialog.current?.close(); setOpen(false); trigger.current?.focus();
  }

  useEffect(() => {
    const reveal = () => { if (window.location.hash === `#${connectionId}`) setOpen(true); };
    const followLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (link?.getAttribute('href') === `#${connectionId}`) setOpen(true);
    };
    reveal(); window.addEventListener('hashchange', reveal); window.addEventListener('click', followLink);
    return () => { window.removeEventListener('hashchange', reveal); window.removeEventListener('click', followLink); };
  }, [connectionId]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    async function refresh() {
      const version = operation.current;
      try {
        if (working.current) return;
        const result = await getFigmaPluginStatus(projectId, controller.signal);
        if (controller.signal.aborted || version !== operation.current) return;
        setConnection(result); onEnabled?.(result.enabled); setStatusError('');
      } catch (cause) {
        if (!controller.signal.aborted && version === operation.current) setStatusError(cause instanceof Error ? cause.message : '실시간 연결을 확인하지 못했어요.');
      } finally {
        if (open && !controller.signal.aborted) timer = window.setTimeout(() => void refresh(), 5000);
      }
    }
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [projectId, fileUrl, onEnabled, open, revision]);

  async function create() {
    if (working.current) return;
    working.current = true;
    const version = ++operation.current;
    setBusy(true); setError(''); setCopied('');
    try {
      const result = await createFigmaPairing(projectId);
      if (version !== operation.current) return;
      setPairing(result); setNow(Date.now());
      setConnection({ enabled: true, connected: false, expires_at: null, last_received_at: null }); onEnabled?.(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '코드를 만들지 못했어요.'); }
    finally { working.current = false; setBusy(false); }
  }

  async function disconnect() {
    if (working.current) return;
    working.current = true;
    const version = ++operation.current;
    setBusy(true); setError('');
    try {
      const result = await disconnectFigmaPlugin(projectId);
      if (version !== operation.current) return;
      setConnection(result); setPairing(undefined); onEnabled?.(result.enabled);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '연결을 해제하지 못했어요.'); }
    finally { working.current = false; setBusy(false); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setError('입력란을 선택한 뒤 Ctrl+C로 복사해 주세요.'); }
  }

  return <div id={connectionId} className={styles.connection}>
    <p className={styles.hint} role="status">{connection ? messages[state][0] : '실시간 연결 확인 중…'}</p>
    <button ref={trigger} type="button" className={`${ui.ghostButton} ${styles.trigger}`} onClick={() => { setNow(Date.now()); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open}>Figma 실시간 연결 관리</button>
    {open && <dialog ref={dialog} className={styles.panel} aria-labelledby={`${connectionId}-title`} aria-describedby={`${connectionId}-intro`}
      onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}>
      <header className={styles.header}><div><span className={styles.eyebrow}>FIGMA → MOEUM</span><h2 id={`${connectionId}-title`}>Figma 실시간 연결</h2></div>
        <button type="button" className={ui.ghostButton} aria-label="실시간 연결 닫기" onClick={close}>×</button></header>
      <div className={styles.body}>
        <p id={`${connectionId}-intro`}>설치 → 코드 입력 → 전송 확인, 세 단계로 디자인 변경사항을 모아요.</p>
        <div className={styles.status} data-state={error ? 'error' : state} role="status" aria-live="polite"><strong>{error ? '연결 확인 필요' : messages[state][0]}</strong><p>{error ? '아래 오류 안내를 확인하고 다시 시도해 주세요.' : messages[state][1]}</p></div>
        <ol className={styles.steps}>
          <li><span className={styles.number}>1</span><div>
            <h3>Figma Desktop에 플러그인 설치</h3>
            <p><a href="https://github.com/0hyeona/moeum/archive/refs/heads/main.zip" target="_blank" rel="noreferrer">최신 플러그인 소스 받기 ↗</a> 후 ZIP 파일을 압축 해제하세요.</p>
            <p>Figma Desktop에서 연결할 디자인 파일을 열고 왼쪽 위 메뉴를 선택하세요.</p>
            <p className={styles.menu}>플러그인 <b>›</b> 개발 <b>›</b> 매니페스트에서 플러그인 가져오기</p>
            <p>압축을 푼 폴더에서 <code>figma-plugin-local/manifest.json</code>을 선택하세요.</p>
            <p className={styles.hint}>설치했다면 플러그인 › 개발 › ‘모음 실시간 연결’을 실행하세요. 웹 브라우저에서는 개발 플러그인을 가져올 수 없어요.</p>
            <p className={styles.hint}>이 플러그인은 별도의 Google 계정 연결이나 Figma OAuth 승인이 필요하지 않아요.</p>
          </div></li>
          <li className={styles.pairingStep}><span className={styles.number}>2</span><div>
            <h3>연결 코드와 파일 공유 링크 입력</h3>
            <p>대시보드 › Figma 실시간 연결 관리에서 코드를 만든 뒤, Figma 플러그인에 아래 두 값을 붙여 넣으세요.</p>
            <button type="button" className={ui.secondaryButton} disabled={busy || !fileUrl} onClick={() => void create()}>{busy ? '처리 중…' : '새 연결 코드 생성'}</button>
            {pairing && <div className={styles.field}>
              <label htmlFor={`figma-pairing-${projectId}`}>연결 코드 <span>{codeUsable ? `남은 시간 ${remainingTime(pairing.expires_at, now)}` : state === 'code-expired' ? '만료됨' : '사용 완료'}</span></label>
              <div className={styles.copyRow}><input id={`figma-pairing-${projectId}`} readOnly value={pairing.code} disabled={!codeUsable} onFocus={event => event.currentTarget.select()} />
                <button type="button" className={ui.secondaryButton} disabled={!codeUsable} onClick={() => void copy(pairing.code, 'code')}>{copied === 'code' ? '복사됨' : '코드 복사'}</button></div>
            </div>}
            <div className={styles.field}><label htmlFor={`figma-file-${projectId}`}>프로젝트에 등록한 파일 공유 링크</label>
              <div className={styles.copyRow}><input id={`figma-file-${projectId}`} readOnly value={fileUrl} onFocus={event => event.currentTarget.select()} />
                <button type="button" className={ui.secondaryButton} onClick={() => void copy(fileUrl, 'url')}>{copied === 'url' ? '복사됨' : '링크 복사'}</button></div></div>
            <p>플러그인에서 <strong>‘연결하고 기준 저장’</strong>을 누르세요. 지금 열어 둔 파일과 공유 링크가 같아야 해요.</p>
            <p className={styles.hint}>코드는 10분간 한 번만 사용할 수 있어요. 새 코드를 만들면 이전 플러그인 연결은 교체돼요.</p>
          </div></li>
          <li><span className={styles.number}>3</span><div>
            <h3>‘전송 완료’ 확인 후 편집 시작</h3>
            <p>Figma 플러그인의 ‘전송 완료’를 확인하세요. 이 창은 5초마다 연결 상태를 자동 확인해요.</p>
            {connection?.last_received_at && <p className={styles.received}>마지막 전송: {new Date(connection.last_received_at).toLocaleString('ko-KR')}</p>}
            <p className={styles.hint}>첫 전송은 비교 기준만 저장해요. 이후 편집은 약 1초 동안 묶어 변경사항으로 추가해요. 대시보드에서 새로고침해 확인하세요.</p>
            <p className={styles.hint}>Figma 플러그인 창을 계속 열어 두세요. 연결은 최대 8시간 유지돼요.</p>
            <button type="button" className={`${ui.primaryButton} ${styles.checkButton}`} disabled={busy} onClick={() => setRevision(value => value + 1)}>연결 상태 다시 확인</button>
          </div></li>
        </ol>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <details className={styles.help}><summary>연결이 안 될 때 확인하세요</summary>
          <p>코드 만료: 새 코드를 생성해 다시 입력하세요.</p><p>파일 불일치: 프로젝트에 등록한 파일을 Desktop에서 열고 같은 파일의 공유 링크를 입력하세요.</p>
          <p>전송 오류: 플러그인의 오류 안내를 확인한 뒤 ‘지금 보내기 / 다시 시도’를 누르세요. 이 화면에서는 전송 오류의 상세 내용을 볼 수 없어요.</p>
        </details>
      </div>
      <footer className={styles.footer}>{connection?.enabled && <button type="button" className={ui.ghostButton} disabled={busy} onClick={() => void disconnect()}>실시간 연결 해제</button>}<button type="button" className={ui.primaryButton} onClick={close}>닫기</button></footer>
    </dialog>}
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import { createFigmaPairing, disconnectFigmaPlugin, getFigmaPluginStatus, type FigmaPairing, type FigmaPluginStatus } from '../api/figmaPlugin';
import { figmaLiveState, remainingTime } from '../data/figmaLiveState';
import ui from './ui.module.css';
import styles from './FigmaLiveConnection.module.css';

type Props = { projectId: string; fileUrl: string; onEnabled?: (enabled: boolean) => void };
const messages = {
  idle: ['연결 준비', '코드와 파일 링크를 Figma 플러그인에 붙여 넣으세요.'],
  waiting: ['플러그인 연결 대기', 'Figma 플러그인에 연결 코드와 파일 공유 링크를 입력해 주세요.'],
  baseline: ['연결 성공 · 첫 전송 대기', '플러그인이 연결됐어요. 첫 비교 기준을 저장하고 있어요.'],
  connected: ['연결 성공 · 전송 확인', '첫 전송은 비교 기준이에요. 이제 Figma를 수정하면 변경사항을 모아요.'],
  expired: ['연결 만료', '새 코드를 만들어 플러그인에서 다시 연결해주세요.'],
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
  const [reconnecting, setReconnecting] = useState(false);
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
  const cardStatus = !connection ? (statusError ? '연결 확인 필요' : '')
    : statusError ? '연결 확인 필요'
    : state === 'connected' || state === 'baseline' ? '연결 중'
    : state === 'expired' ? '연결 만료'
    : state === 'code-expired' ? '연결 코드 만료'
    : state === 'waiting' ? '연결 대기' : '미연결';
  const cardHint = !connection && !statusError ? '' : statusError ? '연결 상태를 확인하지 못했어요. 연결 관리에서 다시 확인해주세요.'
    : state === 'expired' || state === 'code-expired' ? '변경사항을 받으려면 다시 연결해주세요.'
    : state === 'idle' ? '변경사항을 받으려면 플러그인을 연결해주세요.'
    : state === 'waiting' ? '플러그인에서 연결을 완료해주세요.'
    : connection ? '플러그인을 켜두면 변경사항이 모여요.' : '';
  const active = state === 'connected' || state === 'baseline';
  const showPairing = !active || reconnecting;
  const codeUsable = state === 'waiting' && Boolean(pairing);

  useEffect(() => () => { operation.current++; }, []);

  useEffect(() => {
    const expiresAt = connection?.expires_at;
    if (!expiresAt) return;
    const delay = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), delay + 1);
    return () => window.clearTimeout(timer);
  }, [connection?.expires_at]);

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
        setConnection(result); setNow(Date.now()); onEnabled?.(result.enabled); setStatusError('');
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
    {cardStatus && <p className={styles.cardStatus} data-state={statusError ? 'error' : state} role="status">{cardStatus}</p>}
    <button ref={trigger} type="button" className={`${ui.secondaryButton} ${styles.trigger}`} onClick={() => { setNow(Date.now()); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open}>실시간 연결 관리</button>
    {cardHint && <p className={styles.hint}>{cardHint}</p>}
    {open && <dialog ref={dialog} className={styles.panel} aria-labelledby={`${connectionId}-title`} aria-describedby={`${connectionId}-intro`}
      onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>FIGMA → MOEUM</span><h2 id={`${connectionId}-title`}>Figma 실시간 연결</h2>
          <p id={`${connectionId}-intro`}>플러그인으로 디자인 변경사항을 모아요.</p></div>
        <button type="button" className={ui.ghostButton} aria-label="실시간 연결 닫기" onClick={close}>×</button>
      </header>
      <div className={styles.body}>
        {(connection || error) && <div className={styles.status} data-state={error ? 'error' : state} role="status" aria-live="polite">
          <strong>{error ? '연결 확인 필요' : messages[state][0]}</strong>
          <p>{error ? '연결 상태를 다시 확인해주세요.' : messages[state][1]}</p>
        </div>}
        {showPairing ? <section className={styles.pairing} aria-label="플러그인 연결 정보">
          <p className={styles.instruction}>Figma에서 <strong>‘모음 실시간 연결’</strong>을 열고 아래 두 값을 입력하세요.</p>
          <div className={styles.field}>
            <label htmlFor={`figma-pairing-${projectId}`}>연결 코드
              {pairing && <span>{codeUsable ? remainingTime(pairing.expires_at, now) + ' 남음' : state === 'code-expired' ? '만료됨' : '사용 완료'}</span>}
            </label>
            {pairing ? <>
              <div className={styles.copyRow}>
                <input id={`figma-pairing-${projectId}`} className={styles.code} readOnly value={pairing.code} disabled={!codeUsable} onFocus={event => event.currentTarget.select()} />
                <button type="button" className={ui.secondaryButton} disabled={!codeUsable} onClick={() => void copy(pairing.code, 'code')}>{copied === 'code' ? '복사됨' : '코드 복사'}</button>
              </div>
              <button type="button" className={styles.textButton} disabled={busy || !fileUrl} onClick={() => void create()}>{busy ? '생성 중…' : '코드 다시 만들기'}</button>
            </> : <button type="button" className={`${ui.primaryButton} ${styles.createButton}`} disabled={busy || !fileUrl} onClick={() => void create()}>{busy ? '생성 중…' : '연결 코드 생성'}</button>}
          </div>
          <div className={styles.field}>
            <label htmlFor={`figma-file-${projectId}`}>파일 공유 링크</label>
            <div className={styles.copyRow}>
              <input id={`figma-file-${projectId}`} readOnly value={fileUrl} onFocus={event => event.currentTarget.select()} />
              <button type="button" className={ui.secondaryButton} onClick={() => void copy(fileUrl, 'url')}>{copied === 'url' ? '복사됨' : '링크 복사'}</button>
            </div>
          </div>
          <p className={styles.finishHint}>입력한 뒤 플러그인에서 <strong>‘연결하고 기준 저장’</strong>을 누르세요.</p>
          <p className={styles.hint}>코드는 10분간 한 번만 사용해요. 새 코드는 기존 연결을 교체해요.</p>
        </section> : <section className={styles.connectedInfo} aria-label="연결 정보">
          <p>Figma 플러그인 창을 열어둔 채 편집해주세요.</p>
          <p className={styles.hint}>{connection?.last_received_at ? '마지막 전송: ' + new Date(connection.last_received_at).toLocaleString('ko-KR') : '첫 전송을 기다리고 있어요.'}</p>
          <button type="button" className={styles.textButton} onClick={() => setReconnecting(true)}>다른 코드로 다시 연결</button>
        </section>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.guides}>
          <details className={styles.help}>
            <summary>처음 연결하나요? 플러그인 설치 방법</summary>
            <ol className={styles.installSteps}>
              <li><a href="https://github.com/0hyeona/moeum/archive/refs/heads/main.zip" target="_blank" rel="noreferrer">플러그인 다운로드 ↗</a> 후 ZIP 파일의 압축을 풀어주세요.</li>
              <li>Figma Desktop에서 연결할 파일을 열고 <strong>플러그인 › 개발 › 매니페스트에서 플러그인 가져오기</strong>를 선택하세요.</li>
              <li><code>figma-plugin-local/manifest.json</code>을 선택한 뒤, <strong>플러그인 › 개발 › 모음 실시간 연결</strong>을 실행하세요.</li>
            </ol>
            <p className={styles.hint}>설치는 처음 한 번만 필요해요. 웹 브라우저에서는 설치할 수 없고, Google·Figma 계정 승인은 필요하지 않아요.</p>
          </details>
          <details className={styles.help}>
            <summary>연결이 안 되거나 전송이 멈췄나요?</summary>
            <ul className={styles.installSteps}>
              <li>코드 만료: 새 코드를 만들어 다시 입력해주세요.</li>
              <li>파일 불일치: Figma에서 연 파일과 위 공유 링크가 같은지 확인해주세요.</li>
              <li>전송 오류: 플러그인의 오류 안내를 확인하고 ‘지금 보내기 / 다시 시도’를 누르세요.</li>
            </ul>
            <p className={styles.hint}>첫 전송은 비교 기준을 저장해요. 이후 편집은 약 1초씩 묶어 기록하며, 플러그인 창을 열어둬야 해요. 연결은 최대 8시간 유지돼요.</p>
            {connection?.enabled && <button type="button" className={styles.disconnectButton} disabled={busy} onClick={() => void disconnect()}>실시간 연결 해제</button>}
          </details>
        </div>
      </div>
      <footer className={styles.footer}>
        <button type="button" className={ui.secondaryButton} disabled={busy} onClick={() => setRevision(value => value + 1)}>상태 다시 확인</button>
        <span className={styles.copyFeedback} role="status" aria-live="polite">{copied ? (copied === 'code' ? '코드를 복사했어요.' : '링크를 복사했어요.') : ''}</span>
      </footer>
    </dialog>}
  </div>;
}

import { useEffect, useState } from 'react';
import { createFigmaPairing, disconnectFigmaPlugin, getFigmaPluginStatus, type FigmaPairing, type FigmaPluginStatus } from '../api/figmaPlugin';
import ui from './ui.module.css';
import styles from './FigmaLiveConnection.module.css';

type Props = { projectId: string; fileUrl: string; onEnabled?: (enabled: boolean) => void };

export function FigmaLiveConnection({ projectId, fileUrl, onEnabled }: Props) {
  const connectionId = `figma-live-${projectId}`;
  const [connection, setConnection] = useState<FigmaPluginStatus>();
  const [pairing, setPairing] = useState<FigmaPairing>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === `#${connectionId}`) setOpen(true);
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [connectionId]);

  useEffect(() => {
    const controller = new AbortController();
    getFigmaPluginStatus(projectId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setConnection(result);
      onEnabled?.(result.enabled);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '실시간 연결을 확인하지 못했어요.');
    });
    return () => controller.abort();
  }, [projectId, fileUrl, onEnabled]);

  async function create() {
    if (busy) return;
    setBusy(true); setError(''); setCopied(false);
    try {
      const result = await createFigmaPairing(projectId);
      setPairing(result);
      setConnection({ enabled: true, connected: false, expires_at: null, last_received_at: null });
      onEnabled?.(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '코드를 만들지 못했어요.'); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      setConnection(await disconnectFigmaPlugin(projectId));
      setPairing(undefined);
      onEnabled?.(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '연결을 해제하지 못했어요.'); }
    finally { setBusy(false); }
  }

  return <div id={connectionId} className={styles.connection}>
    <button type="button" className={ui.ghostButton} onClick={() => setOpen(value => !value)} aria-expanded={open}>
      {connection?.enabled ? '실시간 연결 관리' : '플러그인으로 실시간 연결'}
    </button>
    {open && <section className={styles.panel} aria-label="Figma 실시간 연결">
      <p>Figma에서 ‘모음 실시간 연결’을 켜두면 수정 내용을 바로 보내요.</p>
      <ol>
        <li>Figma Desktop에서 모음 플러그인을 실행하세요.</li>
        <li>아래 코드를 만든 뒤 플러그인에 코드와 현재 파일의 공유 링크를 입력하세요.</li>
        <li>‘전송 완료’를 확인한 뒤 이 화면에서 새로고침하세요.</li>
      </ol>
      <p className={styles.hint}>첫 전송은 비교 기준을 저장해요. 이후 편집은 약 1초 동안 묶어 한 변경사항으로 추가해요.</p>
      <button type="button" className={ui.secondaryButton} disabled={busy || !fileUrl} onClick={() => void create()}>
        {busy ? '처리 중…' : pairing || connection?.enabled ? '새 연결 코드 만들기' : '연결 코드 만들기'}
      </button>
      {pairing && <div className={styles.code}>
        <label htmlFor={`figma-pairing-${projectId}`}>10분간 유효한 일회용 코드</label>
        <input id={`figma-pairing-${projectId}`} readOnly value={pairing.code} onFocus={event => event.currentTarget.select()} />
        <button type="button" className={ui.ghostButton} onClick={() => {
          void navigator.clipboard.writeText(pairing.code).then(() => setCopied(true))
            .catch(() => setError('코드를 선택한 뒤 Ctrl+C로 복사해 주세요.'));
        }}>{copied ? '복사됨' : '코드 복사'}</button>
      </div>}
      {connection?.enabled && <button type="button" className={ui.ghostButton} disabled={busy} onClick={() => void disconnect()}>실시간 연결 해제</button>}
      <p className={styles.hint}>새 코드는 이전 플러그인 연결을 교체해요. 연결은 최대 8시간 유지돼요.</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>}
  </div>;
}

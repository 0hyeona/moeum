import { useEffect, useRef, useState } from 'react';
import { getNotionConnection, startNotionConnection, type NotionConnection as Connection } from '../api/notion';
import form from './form.module.css';
import ui from './ui.module.css';

export function NotionConnection() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    getNotionConnection(controller.signal).then(setConnection).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '연결 상태를 확인하지 못했어요.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function connect() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await startNotionConnection('/settings#notion-account');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Notion 연결을 시작하지 못했어요.');
      busy.current = false;
      setPending(false);
    }
  }

  if (loading) return null;
  if (connection?.connected) return error ? <p id="notion-account" className={form.error} role="alert">{error}</p> : null;

  return <div id="notion-account" style={{ marginBlock: 16 }}>
    <p role="status">{'Notion 계정을 연결하고 읽을 페이지를 승인한 뒤, 아래에 페이지 URL을 저장해 주세요.'}</p>
    <button type="button" className={ui.secondaryButton} disabled={loading || pending} onClick={() => void connect()}>
      {pending ? '승인 화면으로 이동 중…' : 'Notion 계정 연결'}
    </button>
    {error && <p className={form.error} role="alert">{error}</p>}
  </div>;
}

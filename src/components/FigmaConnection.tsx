import { useEffect, useRef, useState } from 'react';
import { FigmaCallbackMismatchError, getFigmaConnection, startFigmaConnection, type FigmaConnection as Connection } from '../api/figma';
import form from './form.module.css';
import ui from './ui.module.css';

type Props = {
  compact?: boolean;
  returnTo?: string;
  buttonClassName?: string;
  onStatus?: (connected: boolean) => void;
  pluginConnectionId?: string;
};

export function FigmaConnection({ compact = false, returnTo = '/settings#figma-account', buttonClassName, onStatus, pluginConnectionId }: Props) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [needsPlugin, setNeedsPlugin] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    getFigmaConnection(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setConnection(result);
      onStatus?.(result.connected && Boolean(result.figma_user_id));
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Figma 연결 상태를 확인하지 못했어요.');
      onStatus?.(false);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [onStatus]);

  async function connect() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setNeedsPlugin(false);
    try {
      await startFigmaConnection(returnTo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Figma 승인 화면을 열지 못했어요.');
      setNeedsPlugin(cause instanceof FigmaCallbackMismatchError);
      busy.current = false;
      setPending(false);
    }
  }

  if (loading) return <span role="status">Figma 계정 확인 중…</span>;
  const connected = connection?.connected && Boolean(connection.figma_user_id);
  if (compact && connected && !error) return null;

  const button = <button type="button" className={buttonClassName ?? ui.secondaryButton}
    disabled={pending} onClick={() => void connect()}>
    {pending ? '승인 화면으로 이동 중…' : connected ? 'Figma 계정 다시 연결' : 'Figma 계정 연결'}
  </button>;
  const feedback = <>
    {error && <p className={form.error} role="alert">{error}</p>}
    {needsPlugin && <p>{pluginConnectionId
      ? <a href={`#${pluginConnectionId}`}>플러그인으로 실시간 연결하기</a>
      : <a href="/settings#settings-url-Figma">프로젝트 설정에 Figma 파일 링크를 저장한 뒤 플러그인으로 연결해 주세요.</a>}</p>}
  </>;
  if (compact) return <>
    {button}
    {feedback}
  </>;

  return <div id="figma-account" style={{ marginBlock: 16 }}>
    <p role="status">{connected ? 'Figma 계정이 연결됐어요.' : 'Figma 계정을 연결하면 등록한 파일의 변경사항을 가져올 수 있어요.'}</p>
    {button}
    {feedback}
  </div>;
}

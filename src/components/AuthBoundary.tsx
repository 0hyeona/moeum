import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { clearAccessToken, getAccessToken, getCurrentUser, logout, type AuthUser } from '../api/auth';
import { ApiError } from '../api/client';
import { SessionSkeleton } from './Skeleton';
import styles from './AuthBoundary.module.css';

export function AuthBoundary({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!getAccessToken()) { setExpired(true); return; }
    const controller = new AbortController();
    setError('');
    getCurrentUser(controller.signal).then(setUser).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) {
        clearAccessToken();
        setExpired(true);
      } else setError(cause instanceof Error ? cause.message : '로그인 정보를 확인하지 못했습니다.');
    });
    return () => controller.abort();
  }, [attempt]);

  async function signOut() {
    if (leaving) return;
    setLeaving(true);
    setError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        clearAccessToken();
        navigate('/login', { replace: true });
      } else setError(cause instanceof Error ? cause.message : '로그아웃에 실패했습니다. 다시 시도해주세요.');
    } finally { setLeaving(false); }
  }
  if (expired) return <Navigate to="/login" replace />;
  if (!user) return error ? <main className={styles.loading}>
    <p role="alert">{error}</p><button onClick={() => setAttempt(value => value + 1)}>다시 시도</button>
  </main> : <SessionSkeleton />;
  return <>
    <div className={styles.account}>
      <span>{user.name}님</span>
      <button onClick={() => void signOut()} disabled={leaving}>{leaving ? '로그아웃 중…' : '로그아웃'}</button>
      {error && <p role="alert">{error}</p>}
    </div>
    {children}
  </>;
}

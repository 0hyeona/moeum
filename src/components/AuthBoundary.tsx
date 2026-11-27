import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { clearAccessToken, getAccessToken, getCurrentUser, logout, type AuthUser } from '../api/auth';
import { ApiError, getSessionExpiresAt, hasExpiredSessionNotice, renewLoginSession, subscribeSessionExpiration } from '../api/client';
import { SessionSkeleton } from './Skeleton';
import { AuthContext } from '../state/AuthContext';
import { ProjectsProvider } from '../state/ProjectsContext';
import styles from './AuthBoundary.module.css';

export function AuthBoundary({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [expiredNotice, setExpiredNotice] = useState(hasExpiredSessionNotice);
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let checking = false;
    const unsubscribe = subscribeSessionExpiration(() => {
      setExpiredNotice(true);
      setExpired(true);
      setUser(null);
    });
    async function verifySession() {
      if (checking || controller.signal.aborted || document.hidden) return;
      checking = true;
      const previousToken = getAccessToken();
      setError('');
      try {
        // Also restores a closed browser/tab from the first-party HttpOnly cookie.
        await renewLoginSession();
        controller.signal.throwIfAborted();
        const current = await getCurrentUser(controller.signal);
        if (!controller.signal.aborted) setUser(current);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clearAccessToken();
          setExpiredNotice(Boolean(previousToken) || cause.code !== 'AUTH_REQUIRED');
          setExpired(true);
        } else if (!(cause instanceof Error && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : '로그인 정보를 확인하지 못했습니다.');
        }
      } finally { checking = false; }
    }
    async function keepAlive() {
      if (checking || controller.signal.aborted) return;
      window.clearTimeout(timer);
      await verifySession();
      if (controller.signal.aborted) return;
      const expiresAt = getSessionExpiresAt();
      const delay = expiresAt === null ? 30000 : Math.min(15 * 60 * 1000, Math.max(30000, expiresAt - Date.now() - 60000));
      timer = window.setTimeout(() => void keepAlive(), delay);
    }
    function resume() {
      void keepAlive();
    }
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    resume();
    return () => {
      unsubscribe();
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
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
  if (expired) return <Navigate to="/login" replace state={{ sessionExpired: expiredNotice }} />;
  if (!user) return error ? <main className={styles.loading}>
    <p role="alert">{error}</p><button onClick={() => setAttempt(value => value + 1)}>다시 시도</button>
  </main> : <SessionSkeleton />;
  return <AuthContext.Provider value={{ user, signOut, leaving, error }}>
    <ProjectsProvider>{children}</ProjectsProvider>
  </AuthContext.Provider>;
}

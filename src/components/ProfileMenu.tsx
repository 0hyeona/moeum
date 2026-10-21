import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../state/AuthContext';
import styles from './ProfileMenu.module.css';

export function ProfileMenu() {
  const { user, signOut, leaving, error } = useAuth();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const { pathname } = useLocation();
  const name = user.name.trim() || user.user_id || '사용자';

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div ref={container} className={styles.profile}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
    <button ref={button} type="button" className={styles.avatar}
      aria-label={`${name}님 프로필`} aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">{Array.from(name)[0]}</span>
    </button>
    {open && <section id={panelId} className={styles.panel} aria-label="내 프로필">
      <div className={styles.details}>
        <strong>{name}님</strong>
        <span>{user.email}</span>
      </div>
      <button type="button" className={styles.logout} onClick={() => void signOut()} disabled={leaving}>
        {leaving ? '로그아웃 중…' : '로그아웃'}
      </button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>}
  </div>;
}

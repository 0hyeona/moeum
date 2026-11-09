import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router';
import logo from '../../assets/moeum-logo.svg';
import styles from '../pages/LoginPage.module.css';

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className={styles.page}><div className={styles.content}>
    <Link to="/login" className={styles.brand} aria-label="모음 로그인">
      <img src={logo} alt="모음" width="162.91" height="82" />
    </Link>
    <div className={styles.loginArea}>
      {children}
      <p className={styles.terms}>흩어진 기록이 하나의 경험이 되는 곳, 모음</p>
    </div>
  </div></main>;
}

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string; hint?: string; error?: string; success?: string; ref?: Ref<HTMLInputElement>;
};

export function AuthField({ label, hint, error, success, id, ref, ...input }: AuthFieldProps) {
  const generated = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = input.type === 'password';
  const inputId = id ?? generated;
  const description = error || success || hint;
  return <div className={styles.field}>
    <label htmlFor={inputId}>{label}</label>
    <div className={styles.inputWrap}>
    <input {...input} type={isPassword && visible ? 'text' : input.type} id={inputId} ref={ref} aria-invalid={!!error}
      className={isPassword ? styles.passwordInput : undefined}
      aria-describedby={description ? `${inputId}-description` : undefined} />
    {isPassword && <button type="button" className={styles.passwordToggle}
      aria-label={`${label} ${visible ? '숨기기' : '보기'}`} aria-pressed={visible}
      aria-controls={inputId} disabled={input.disabled}
      onClick={() => setVisible(current => !current)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
        {visible && <path d="m3 3 18 18" />}
      </svg>
    </button>}
    </div>
    {description && <p id={`${inputId}-description`}
      className={error ? styles.fieldError : success ? styles.success : styles.hint}
      role={error ? 'alert' : undefined}>{description}</p>}
  </div>;
}

export function AuthButton({ children, outlined = false, className = '', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { outlined?: boolean }) {
  return <button {...props} className={`${styles.primaryButton} ${outlined ? styles.outlined : ''} ${className}`}>{children}</button>;
}

export function PendingContent({ pending, label, children }:
  { pending: boolean; fields: number; label: string; children: ReactNode }) {
  return <div className={styles.pendingContent} aria-busy={pending}>
    {children}
    <div role="status">{pending && <p className={styles.pendingNotice}><span className={styles.spinner} aria-hidden="true" />{label}</p>}</div>
  </div>;
}

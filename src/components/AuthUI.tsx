import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router';
import logo from '../../assets/moeum-logo.svg';
import styles from '../pages/LoginPage.module.css';
import { FormSkeleton } from './Skeleton';

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className={styles.page}><div className={styles.content}>
    <Link to="/login" className={styles.brand} aria-label="모음 로그인">
      <img src={logo} alt="모음" width="162.91" height="82" />
    </Link>
    <div className={styles.loginArea}>
      {children}
      <p className={styles.terms}>로그인 시 서비스 이용약관 및 개인정보 처리방침에 동의합니다.</p>
    </div>
  </div></main>;
}

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string; hint?: string; error?: string; success?: string; ref?: Ref<HTMLInputElement>;
};

export function AuthField({ label, hint, error, success, id, ref, ...input }: AuthFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const description = error || success || hint;
  return <div className={styles.field}>
    <label htmlFor={inputId}>{label}</label>
    <input {...input} id={inputId} ref={ref} aria-invalid={!!error}
      aria-describedby={description ? `${inputId}-description` : undefined} />
    {description && <p id={`${inputId}-description`}
      className={error ? styles.fieldError : success ? styles.success : styles.hint}
      role={error ? 'alert' : undefined}>{description}</p>}
  </div>;
}

export function AuthButton({ children, outlined = false, className = '', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { outlined?: boolean }) {
  return <button {...props} className={`${styles.primaryButton} ${outlined ? styles.outlined : ''} ${className}`}>{children}</button>;
}

export function PendingContent({ pending, fields, label, children }:
  { pending: boolean; fields: number; label: string; children: ReactNode }) {
  return <div className={styles.pendingContent}>
    <div className={pending ? styles.concealed : undefined} inert={pending} aria-hidden={pending || undefined} aria-busy={pending}>{children}</div>
    {pending && <div className={styles.pendingOverlay}><FormSkeleton fields={fields} /></div>}
    <span className={styles.srOnly} role="status">{pending ? label : ''}</span>
  </div>;
}

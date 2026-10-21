import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { login, startGithubLogin } from '../api/auth';
import github from '../../assets/github-white.svg';
import { AuthButton, AuthField, AuthShell, PendingContent } from '../components/AuthUI';
import { useDocumentTitle } from '../components/ui';
import styles from './LoginPage.module.css';

type Field = 'email' | 'password';

export function LoginPage() {
  useDocumentTitle('로그인');
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const submitting = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  function update(field: Field, value: string) {
    setSubmitError('');
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const next: Partial<Record<Field, string>> = {};
    if (!values.email.trim()) next.email = '이메일을 입력해주세요.';
    else if (emailInput.current?.validity.typeMismatch) next.email = '올바른 이메일 주소를 입력해주세요.';
    if (!values.password) next.password = '비밀번호를 입력해주세요.';
    setErrors(next);
    setSubmitError('');
    if (next.email) { emailInput.current?.focus(); return; }
    if (next.password) { passwordInput.current?.focus(); return; }
    submitting.current = true;
    setIsSubmitting(true);
    try {
      await login({ email: values.email.trim(), password: values.password });
      setValues(current => ({ ...current, password: '' }));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  return <AuthShell>
    <section className={styles.card} aria-labelledby="login-heading" data-figma-node="590:2227">
      <header className={styles.intro}>
        <h1 id="login-heading">프로젝트의 변화가, 하나의 기록이 되도록</h1>
        <p>GitHub, Figma, Notion에 흩어진 프로젝트 변경사항을 모아 AI와 함께 하나의 Story로 정리해보세요.</p>
      </header>
      <div className={styles.actions}>
        <div className={styles.localLogin}>
          <PendingContent pending={isSubmitting} fields={2} label="로그인 요청을 처리하고 있습니다.">
            <form onSubmit={submit} noValidate className={styles.form}>
              <fieldset className={styles.fieldset} disabled={isSubmitting}>
                <AuthField ref={emailInput} id="email" label="이메일 (ID)" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  placeholder="이메일을 입력해주세요." value={values.email} onChange={event => update('email', event.target.value)} error={errors.email} required />
                <AuthField ref={passwordInput} id="password" label="비밀번호" name="password" type="password" autoComplete="current-password"
                  placeholder="비밀번호를 입력해주세요." value={values.password} onChange={event => update('password', event.target.value)} error={errors.password} required />
                {submitError && <p className={styles.error} role="alert">{submitError}</p>}
                <AuthButton type="submit" outlined={!!submitError}>로그인</AuthButton>
              </fieldset>
            </form>
          </PendingContent>
          <nav className={styles.accountLinks} aria-label="계정 관리">
            <button type="button" disabled={isSubmitting} onClick={() => navigate('/password-reset')}>비밀번호 찾기</button>
            <button type="button" disabled={isSubmitting} className={styles.signup} onClick={() => navigate('/signup')}>회원가입</button>
          </nav>
        </div>
        <button className={styles.githubButton} type="button" disabled={isSubmitting} onClick={() => {
          try { startGithubLogin(); } catch (error) { setSubmitError(error instanceof Error ? error.message : 'GitHub 로그인에 실패했습니다.'); }
        }}>
          <span className={styles.githubIcon}><img src={github} alt="" width="24" height="23.4079" /></span>
          Github로 로그인
        </button>
      </div>
    </section>
  </AuthShell>;
}

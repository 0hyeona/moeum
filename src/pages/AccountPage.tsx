import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { checkEmail, requestPasswordCode, resetPassword, signup, verifyPasswordCode } from '../api/auth';
import { ApiError } from '../api/client';
import { AuthButton, AuthField, AuthShell, PendingContent } from '../components/AuthUI';
import { useDocumentTitle } from '../components/ui';
import styles from './LoginPage.module.css';

type Stage = 'name' | 'signup-email' | 'signup-password' | 'email' | 'email-confirmed' | 'code' | 'reset' | 'duplicate' | 'done';
type Field = 'user_id' | 'name' | 'email' | 'password' | 'confirm' | 'code';

export function AccountPage({ mode }: { mode: 'signup' | 'password' }) {
  const isSignup = mode === 'signup';
  const [stage, setStage] = useState<Stage>(isSignup ? 'name' : 'email');
  const [values, setValues] = useState({ user_id: '', name: '', email: '', password: '', confirm: '', code: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [resetToken, setResetToken] = useState('');
  const expiresAt = useRef(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const [resendWait, setResendWait] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const title = stage === 'duplicate' ? '가입된 이메일입니다.' : stage === 'done' ? (isSignup ? '환영합니다! 회원가입이 완료되었어요.' : '비밀번호 변경이 완료되었어요.') : stage === 'reset' ? '새 비밀번호 설정' : isSignup ? '회원가입' : '비밀번호 찾기';
  useDocumentTitle(title);
  useEffect(() => { heading.current?.focus(); }, [stage]);
  useEffect(() => {
    if (!sentAt) return;
    const updateWait = () => setResendWait(Math.max(0, Math.ceil((sentAt + 60_000 - Date.now()) / 1000)));
    updateWait();
    const timer = window.setInterval(updateWait, 1000);
    return () => window.clearInterval(timer);
  }, [sentAt]);

  function change(field: Field, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
    setError('');
    if (field === 'email' && !isSignup && stage === 'email-confirmed') setStage('email');
  }

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await action(); }
    catch (cause) {
      const text = cause instanceof Error ? cause.message : '요청에 실패했습니다. 다시 시도해주세요.';
      if (isSignup && cause instanceof ApiError && cause.status === 409 && text.includes('이메일')) {
        setStage('duplicate');
      } else if (stage === 'email' && cause instanceof ApiError && cause.status === 404) {
        setErrors({ email: text });
      } else if (stage === 'code' && cause instanceof ApiError && cause.status === 400) {
        setErrors({ code: text });
      } else setError(text);
    } finally { pending.current = false; setBusy(false); }
  }

  async function sendCode() {
    await requestPasswordCode(values.email.trim());
    setValues(current => ({ ...current, code: '' }));
    setErrors({});
    setStage('code');
    setSentAt(Date.now());
    setResendWait(60);
    setMessage('인증번호를 발송했어요. 10분 안에 입력해주세요.');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const next: Partial<Record<Field, string>> = {};
    if (isSignup) {
      if (!values.name.trim()) next.name = '이름을 입력해주세요.';
      if (!values.user_id.trim()) next.user_id = '아이디를 입력해주세요.';
    }
    if (stage === 'signup-email' || stage === 'signup-password' || stage === 'email') {
      const email = form.current?.querySelector<HTMLInputElement>('input[type="email"]');
      if (!values.email.trim() || email?.validity.typeMismatch) next.email = '아이디로 사용할 유효한 이메일 주소를 입력해주세요.';
    }
    if (stage === 'signup-password' || stage === 'reset') {
      if (stage === 'reset' && !/^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s])\S{8,16}$/.test(values.password)) {
        next.password = '비밀번호는 영문, 숫자, 특수문자 조합 8~16자여야 합니다.';
      } else if (values.password.length < 8 || values.password.length > 128) next.password = '비밀번호를 8~128자로 입력해주세요.';
      if (values.password !== values.confirm) next.confirm = '비밀번호가 일치하지 않습니다.';
    }
    if (stage === 'code' && !/^[0-9]{6}$/.test(values.code)) next.code = '인증번호 6자리를 입력해주세요.';
    setErrors(next);
    setError('');
    const first = Object.keys(next)[0];
    if (first) { form.current?.querySelector<HTMLInputElement>('[name="' + first + '"]')?.focus(); return; }
    if (stage === 'name') { setStage('signup-email'); return; }
    if (stage === 'signup-email') { setStage('signup-password'); return; }
    void run(async () => {
      if (stage === 'signup-password') {
        await signup({ user_id: values.user_id.trim(), name: values.name.trim(), email: values.email.trim(), password: values.password });
        setValues(current => ({ ...current, password: '', confirm: '' }));
        setStage('done');
      } else if (stage === 'email') {
        await checkEmail(values.email.trim());
        setStage('email-confirmed');
      } else if (stage === 'email-confirmed') {
        await sendCode();
      } else if (stage === 'code') {
        const result = await verifyPasswordCode(values.email.trim(), values.code);
        if (!result.reset_token || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new Error('인증번호를 다시 요청해주세요.');
        setResetToken(result.reset_token);
        expiresAt.current = Date.now() + result.expires_in * 1000;
        setStage('reset');
      } else if (stage === 'reset') {
        if (Date.now() >= expiresAt.current) {
          setResetToken(''); setStage('email');
          throw new Error('인증이 만료되었습니다. 이메일 인증부터 다시 진행해주세요.');
        }
        await resetPassword(resetToken, values.password, values.confirm);
        setResetToken('');
        setValues(current => ({ ...current, password: '', confirm: '', code: '' }));
        setStage('done');
      }
    });
  }

  const showEmail = ['signup-email', 'signup-password', 'email', 'email-confirmed', 'code'].includes(stage);
  const showName = ['name', 'signup-email', 'signup-password'].includes(stage);
  const showPassword = stage === 'signup-password' || stage === 'reset';
  const fields = (showName ? 1 : 0) + (stage === 'name' ? 1 : 0) + (showEmail ? 1 : 0) + (showPassword ? 2 : 0) + (stage === 'code' ? 1 : 0);
  const terminal = stage === 'done' || stage === 'duplicate';
  const description = stage === 'reset' ? '안전한 계정 보호를 위해 새로운 비밀번호를 설정해주세요.' : stage === 'code' ? '이메일로 받은 인증번호 6자리를 입력해주세요.' : !isSignup && !terminal ? '가입하신 이메일 주소로 비밀번호 재설정 인증번호를 보내드려요.' : '';

  return <AuthShell>
    <section className={styles.card} aria-labelledby="account-title">
      <header className={styles.intro}>
        <h1 id="account-title" ref={heading} tabIndex={-1}>{title}</h1>
        {description && <p>{description}</p>}
      </header>
      {terminal ? <div className={styles.form}>
        {stage === 'duplicate' ? <div className={styles.result}>
          <p>{values.email}</p><p className={styles.hint}>입력하신 이메일로 가입된 계정이 있습니다.</p>
        </div> : <p className={styles.hint} role="status">{isSignup ? '지금 바로 로그인하여 서비스를 자유롭게 이용해 보세요.' : '새 비밀번호로 다시 로그인해주세요.'}</p>}
        <Link to="/login" className={styles.primaryLink}>로그인하기</Link>
      </div> : <>
        <PendingContent pending={busy} fields={fields} label="요청을 처리하고 있습니다.">
          <form ref={form} onSubmit={submit} className={styles.form} noValidate>
            <fieldset className={styles.fieldset} disabled={busy}>
              {showName && <AuthField label="이름" name="name" autoComplete="name" placeholder="이름을 입력해주세요." maxLength={50} required value={values.name}
                onChange={e => change('name', e.target.value)} error={errors.name} />}
              {stage === 'name' && <AuthField label="아이디" name="user_id" autoComplete="username" placeholder="아이디를 입력해주세요." maxLength={50} required value={values.user_id}
                onChange={e => change('user_id', e.target.value)} error={errors.user_id} hint="1~50자로 입력해주세요." />}
              {showEmail && <AuthField label="이메일 (ID)" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder={isSignup ? 'example@email.com' : '가입한 이메일을 입력해주세요.'}
                required maxLength={255} readOnly={stage === 'code'} value={values.email} onChange={e => change('email', e.target.value)} error={errors.email}
                success={stage === 'email-confirmed' ? '가입된 이메일을 확인했어요.' : undefined} />}
              {stage === 'code' && message && <p className={styles.deliveryNotice} role="status">{message}</p>}
              {stage === 'code' && <AuthField label="인증번호 입력" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="인증번호 6자리를 입력해주세요."
                maxLength={6} required value={values.code} onChange={e => change('code', e.target.value)} error={errors.code} />}
              {showPassword && <>
                <AuthField label={isSignup ? '비밀번호' : '새 비밀번호'} name="password" type="password" autoComplete="new-password" placeholder={isSignup ? '비밀번호를 입력해주세요.' : '새 비밀번호 입력'}
                  required minLength={8} maxLength={isSignup ? 128 : 16} value={values.password} onChange={e => change('password', e.target.value)} error={errors.password}
                  hint={isSignup ? '8자 이상으로 입력해주세요. (최대 128자)' : '영문, 숫자, 특수문자 조합 8~16자로 입력해주세요.'} />
                <AuthField label={isSignup ? '비밀번호 확인' : '새 비밀번호 재입력'} name="confirm" type="password" autoComplete="new-password" placeholder={isSignup ? '비밀번호를 다시 입력해주세요.' : '새 비밀번호 입력'}
                  required maxLength={isSignup ? 128 : 16} value={values.confirm} onChange={e => change('confirm', e.target.value)} error={errors.confirm}
                  success={!!values.confirm && values.password === values.confirm && !errors.password ? '비밀번호가 일치합니다.' : undefined} />
              </>}
              {error && <p className={styles.error} role="alert">{error}</p>}
              <AuthButton type="submit" outlined={!!error || Object.keys(errors).some(key => !!errors[key as Field])}>
                {stage === 'signup-password' ? '회원가입하기' : stage === 'email-confirmed' ? '인증번호 받기' : stage === 'code' ? '확인' : stage === 'reset' ? '비밀번호 변경 완료' : '다음'}
              </AuthButton>
              {stage === 'code' && <div className={styles.deliveryHelp}>
                <p className={styles.helpTitle}>메일을 받지 못하셨나요?</p>
                <p className={styles.helpDescription}>스팸함과 입력한 이메일 주소를 확인해주세요. 수신까지 잠시 걸릴 수 있어요.</p>
                <div className={styles.deliveryActions}>
                  <button className={styles.resendButton} type="button" disabled={busy || resendWait > 0} onClick={() => void run(sendCode)}>
                    {resendWait > 0 ? `재발송 (${resendWait}초 후)` : '인증번호 재발송'}
                  </button>
                  <button className={styles.changeEmailButton} type="button" onClick={() => { setStage('email'); setErrors({}); setError(''); setMessage(''); setValues(current => ({ ...current, code: '' })); }}>이메일 변경</button>
                </div>
              </div>}
            </fieldset>
          </form>
        </PendingContent>
        <nav className={styles.accountFooter} aria-label="계정 화면 이동">
          {isSignup && stage !== 'name' && <button type="button" disabled={busy} onClick={() => { setStage(stage === 'signup-email' ? 'name' : 'signup-email'); setErrors({}); setError(''); }}>이전</button>}
          <Link to="/login" aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>로그인으로 돌아가기</Link>
        </nav>
      </>}
    </section>
  </AuthShell>;
}

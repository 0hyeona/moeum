import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { checkEmail, requestPasswordCode, resetPassword, verifyPasswordCode } from '../api/auth';
import { AuthButton, AuthField, AuthShell, PendingContent } from '../components/AuthUI';
import { useDocumentTitle } from '../components/ui';
import styles from './LoginPage.module.css';

const steps = [
  { key: 'email', label: '이메일', title: '가입한 이메일을 알려주세요.', description: '비밀번호를 재설정할 인증번호를 보내드릴게요.', placeholder: 'example@email.com', autoComplete: 'email', maxLength: 255 },
  { key: 'code', label: '인증번호', title: '메일로 받은 번호를 입력해주세요.', description: '인증번호 6자리를 입력해주세요.', placeholder: '인증번호 6자리', autoComplete: 'one-time-code', maxLength: 6 },
  { key: 'password', label: '새 비밀번호', title: '새 비밀번호를 만들어주세요.', description: '영문, 숫자, 특수문자를 포함해 8~16자로 입력해주세요.', placeholder: '새 비밀번호를 입력해주세요.', autoComplete: 'new-password', maxLength: 16 },
  { key: 'confirm', label: '새 비밀번호 확인', title: '한 번 더 입력하면 끝이에요.', description: '앞서 입력한 새 비밀번호를 확인할게요.', placeholder: '새 비밀번호를 다시 입력해주세요.', autoComplete: 'new-password', maxLength: 16 },
] as const;
type Field = typeof steps[number]['key'];

export function PasswordResetPage() {
  useDocumentTitle('비밀번호 찾기');
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Field, string>>({ email: '', code: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [backward, setBackward] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [resendWait, setResendWait] = useState(0);
  const pending = useRef(false);
  const composing = useRef(false);
  const resetToken = useRef('');
  const expiresAt = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = steps[step];

  useEffect(() => {
    if (!busy) {
      if (done) heading.current?.focus();
      else input.current?.focus({ preventScroll: true });
    }
  }, [step, busy, done]);
  useEffect(() => {
    if (!sentAt) return;
    const update = () => setResendWait(Math.max(0, Math.ceil((sentAt + 60_000 - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [sentAt]);

  function move(next: number) {
    setBackward(next < step); setStep(next); setError(''); setMessage('');
    if (next === 0) {
      resetToken.current = ''; expiresAt.current = 0;
      setValues(previous => ({ ...previous, code: '', password: '', confirm: '' }));
    }
  }
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '요청에 실패했어요. 다시 시도해주세요.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function sendCode() {
    await requestPasswordCode(values.email.trim());
    setValues(previous => ({ ...previous, code: '' }));
    move(1); setSentAt(Date.now()); setResendWait(60);
    setMessage('인증번호를 발송했어요. 10분 안에 입력해주세요.');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || composing.current) return;
    let validation = '';
    if (step === 0 && (!values.email.trim() || input.current?.validity.typeMismatch)) validation = '올바른 이메일 주소를 입력해주세요.';
    if (step === 1 && !/^[0-9]{6}$/.test(values.code)) validation = '인증번호 6자리를 입력해주세요.';
    if (step === 2 && !/^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s])\S{8,16}$/.test(values.password)) validation = '영문, 숫자, 특수문자를 포함한 8~16자 비밀번호가 필요해요.';
    if (step === 3 && (!values.confirm || values.password !== values.confirm)) validation = '비밀번호가 일치하지 않아요. 다시 확인해주세요.';
    setError(validation);
    if (validation) { input.current?.focus(); return; }
    if (step >= 2 && (!resetToken.current || Date.now() >= expiresAt.current)) {
      move(0); setError('인증이 만료됐어요. 이메일 인증부터 다시 시작해주세요.'); return;
    }
    if (step === 2) { move(3); return; }
    void run(async () => {
      if (step === 0) { await checkEmail(values.email.trim()); await sendCode(); }
      else if (step === 1) {
        const result = await verifyPasswordCode(values.email.trim(), values.code);
        if (!result.reset_token || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new Error('인증번호를 다시 요청해주세요.');
        resetToken.current = result.reset_token;
        expiresAt.current = Date.now() + result.expires_in * 1000;
        move(2);
      } else {
        await resetPassword(resetToken.current, values.password, values.confirm);
        resetToken.current = ''; expiresAt.current = 0;
        setValues(previous => ({ ...previous, code: '', password: '', confirm: '' }));
        setDone(true);
      }
    });
  }
  return <AuthShell>
    <section className={`${styles.card} ${styles.signupCard}`} aria-labelledby="reset-title">
      <header className={styles.signupHeader}>
        <h1 id="reset-title" ref={heading} tabIndex={-1}>{done ? '비밀번호 변경이 완료됐어요.' : '비밀번호 찾기'}</h1>
        {!done && <span className={styles.stepCount} aria-label={`총 4단계 중 ${step + 1}단계`}>{String(step + 1).padStart(2, '0')} <span>/ 04</span></span>}
      </header>
      {done ? <div className={styles.form}>
        <p className={styles.hint} role="status">새 비밀번호로 다시 로그인해주세요.</p>
        <Link to="/login" className={styles.primaryLink}>로그인하기</Link>
      </div> : <>
        <ol className={styles.stepTrack} aria-label="비밀번호 재설정 진행 단계">
          {steps.map((item, index) => <li key={item.key} className={index <= step ? styles.stepActive : undefined} aria-current={index === step ? 'step' : undefined}><span className={styles.srOnly}>{item.label}{index < step ? ' 완료' : ''}</span></li>)}
        </ol>
        <PendingContent pending={busy} fields={1} label="요청을 처리하고 있어요. 잠시만 기다려주세요.">
          <form onSubmit={submit} noValidate onKeyDown={event => {
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
          }}>
            <fieldset className={styles.fieldset} disabled={busy}>
              <div key={current.key} className={`${styles.stepPanel} ${backward ? styles.stepBackward : ''}`}>
                <div className={styles.stepIntro}><h2>{current.title}</h2><p>{current.description}</p></div>
                {step === 1 && <p className={styles.deliveryNotice}>{values.email}</p>}
                <AuthField ref={input} name={current.key} label={current.label} value={values[current.key]}
                  type={step >= 2 ? 'password' : step === 0 ? 'email' : 'text'}
                  inputMode={step === 1 ? 'numeric' : undefined} enterKeyHint={step === 3 ? 'done' : 'next'}
                  autoComplete={current.autoComplete} placeholder={current.placeholder} maxLength={current.maxLength}
                  autoCapitalize="none" spellCheck={false} required error={error}
                  onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
                  onChange={event => {
                    const value = event.target.value;
                    setValues(previous => ({ ...previous, [current.key]: value, ...(step === 2 ? { confirm: '' } : {}) }));
                    setError('');
                  }} />
              </div>
              {message && <p className={styles.deliveryNotice} role="status">{message}</p>}
              <AuthButton type="submit">{busy ? '처리 중…' : step === 0 ? '인증번호 받기' : step === 1 ? '인증번호 확인' : step === 3 ? '비밀번호 변경 완료' : '다음'}{!busy && <span className={styles.buttonArrow} aria-hidden="true">→</span>}</AuthButton>
              <p className={styles.enterHint}>Enter 키로 {step === 3 ? '변경을 완료할' : '다음으로 넘어갈'} 수 있어요.</p>
              {step === 1 && <div className={styles.deliveryHelp}>
                <p className={styles.helpTitle}>메일을 받지 못하셨나요?</p>
                <p className={styles.helpDescription}>스팸함과 이메일 주소를 확인해주세요. 수신까지 잠시 걸릴 수 있어요.</p>
                <div className={styles.deliveryActions}>
                  <button className={styles.resendButton} type="button" disabled={busy || resendWait > 0} onClick={() => void run(sendCode)}>{resendWait > 0 ? `재발송 (${resendWait}초 후)` : '인증번호 재발송'}</button>
                  <button className={styles.changeEmailButton} type="button" onClick={() => move(0)}>이메일 수정</button>
                </div>
              </div>}
            </fieldset>
          </form>
        </PendingContent>
        <nav className={styles.accountFooter} aria-label="비밀번호 찾기 화면 이동">
          {step === 3 && <button type="button" disabled={busy} onClick={() => move(2)}>← 이전</button>}
          <Link to="/login" aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>로그인으로 돌아가기</Link>
        </nav>
      </>}
    </section>
  </AuthShell>;
}

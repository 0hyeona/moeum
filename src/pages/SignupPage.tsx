import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { signup } from '../api/auth';
import { AuthButton, AuthField, AuthShell, PendingContent } from '../components/AuthUI';
import { useDocumentTitle } from '../components/ui';
import styles from './LoginPage.module.css';

const steps = [
  { key: 'name', label: '이름', title: '어떻게 불러드릴까요?', description: '모음에서 사용할 이름을 알려주세요.', placeholder: '이름을 입력해주세요.', autoComplete: 'name', maxLength: 50 },
  { key: 'email', label: '이메일', title: '로그인에 사용할 이메일은요?', description: '로그인과 비밀번호 찾기에 사용해요.', placeholder: 'example@email.com', autoComplete: 'email', maxLength: 255 },
  { key: 'password', label: '비밀번호', title: '비밀번호를 만들어주세요.', description: '8~128자로 입력해주세요.', placeholder: '비밀번호를 입력해주세요.', autoComplete: 'new-password', maxLength: 128 },
  { key: 'confirm', label: '비밀번호 확인', title: '한 번 더 입력하면 끝이에요.', description: '앞서 입력한 비밀번호를 확인할게요.', placeholder: '비밀번호를 다시 입력해주세요.', autoComplete: 'new-password', maxLength: 128 },
] as const;
type Field = typeof steps[number]['key'];

export function SignupPage() {
  useDocumentTitle('회원가입');
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Field, string>>({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [backward, setBackward] = useState(false);
  const pending = useRef(false);
  const composing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = steps[step];
  const last = step === steps.length - 1;

  useEffect(() => { input.current?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => { if (done) heading.current?.focus(); }, [done]);

  function move(next: number) {
    if (pending.current) return;
    setBackward(next < step);
    setError('');
    setSubmitError('');
    setStep(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || composing.current) return;
    const value = values[current.key];
    let message = '';
    if (current.key === 'name') {
      if (!value.trim()) message = `${current.label}을 입력해주세요.`;
    } else if (current.key === 'email') {
      if (!value.trim() || input.current?.validity.typeMismatch) message = '올바른 이메일 주소를 입력해주세요.';
    } else if (current.key === 'password') {
      if (value.length < 8 || value.length > 128) message = '비밀번호는 8~128자로 입력해주세요.';
    } else if (!value || value !== values.password) message = '비밀번호가 일치하지 않아요. 다시 확인해주세요.';
    setError(message);
    if (message) { input.current?.focus(); return; }
    if (!last) { move(step + 1); return; }
    pending.current = true;
    setBusy(true);
    setSubmitError('');
    try {
      await signup({ name: values.name.trim(), user_id: crypto.randomUUID(), email: values.email.trim(), password: values.password });
      setValues(previous => ({ ...previous, password: '', confirm: '' }));
      setDone(true);
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : '회원가입에 실패했어요. 다시 시도해주세요.');
    } finally { pending.current = false; setBusy(false); }
  }

  return <AuthShell>
    <section className={`${styles.card} ${styles.signupCard}`} aria-labelledby="signup-title">
      <header className={styles.signupHeader}>
        <h1 id="signup-title" ref={heading} tabIndex={-1}>{done ? '모음에 오신 것을 환영해요!' : '회원가입'}</h1>
        {!done && <span className={styles.stepCount} aria-label={`총 ${steps.length}단계 중 ${step + 1}단계`}>{String(step + 1).padStart(2, '0')} <span>/ {String(steps.length).padStart(2, '0')}</span></span>}
      </header>
      {done ? <div className={styles.form}>
        <p className={styles.hint}>가입이 완료됐어요. 로그인하고 첫 프로젝트를 시작해보세요.</p>
        <Link to="/login" className={styles.primaryLink}>로그인하기</Link>
      </div> : <>
        <ol className={styles.stepTrack} aria-label="회원가입 진행 단계">
          {steps.map((item, index) => <li key={item.key} className={index <= step ? styles.stepActive : undefined} aria-current={index === step ? 'step' : undefined}>
            <span className={styles.srOnly}>{item.label}{index < step ? ' 완료' : ''}</span>
          </li>)}
        </ol>
        <PendingContent pending={busy} fields={1} label="가입을 완료하고 있어요. 잠시만 기다려주세요.">
          <form onSubmit={submit} noValidate onKeyDown={event => {
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
          }}>
            <fieldset disabled={busy} className={styles.fieldset}>
              <div key={current.key} className={`${styles.stepPanel} ${backward ? styles.stepBackward : ''}`}>
                <div className={styles.stepIntro}><h2>{current.title}</h2><p>{current.description}</p></div>
                <AuthField ref={input} name={current.key} label={current.label} value={values[current.key]}
                  type={current.key === 'password' || current.key === 'confirm' ? 'password' : current.key === 'email' ? 'email' : 'text'}
                  placeholder={current.placeholder} autoComplete={current.autoComplete} maxLength={current.maxLength}
                  autoCapitalize="none" spellCheck={false} required error={error} enterKeyHint={last ? 'done' : 'next'}
                  onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
                  onChange={event => {
                    const value = event.target.value;
                    setValues(previous => ({ ...previous, [current.key]: value, ...(current.key === 'password' ? { confirm: '' } : {}) }));
                    setError(''); setSubmitError('');
                  }} />
              </div>
              {submitError && <div className={styles.signupError} role="alert"><p>{submitError}</p><button type="button" onClick={() => move(1)}>이메일 다시 확인하기</button></div>}
              <AuthButton type="submit">{busy ? '가입 중…' : last ? '가입 완료하기' : '다음'}{!busy && <span className={styles.buttonArrow} aria-hidden="true">→</span>}</AuthButton>
              <p className={styles.enterHint}>Enter 키로 {last ? '가입을 완료할' : '다음으로 넘어갈'} 수 있어요.</p>
            </fieldset>
          </form>
        </PendingContent>
        <nav className={styles.accountFooter} aria-label="회원가입 화면 이동">
          {step > 0 && <button type="button" disabled={busy} onClick={() => move(step - 1)}>← 이전</button>}
          <Link to="/login" aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>로그인으로 돌아가기</Link>
        </nav>
      </>}
    </section>
  </AuthShell>;
}

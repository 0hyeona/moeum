import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { feedbackRetryAfter, feedbackTypes, FEEDBACK_MAX_LENGTH, isFeedbackConfigured, isFeedbackEmailValid, sendFeedback, type FeedbackType } from '../api/feedback';
import form from './form.module.css';
import ui from './ui.module.css';
import styles from './FeedbackModal.module.css';

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const firstType = useRef<HTMLInputElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [type, setType] = useState<FeedbackType | ''>('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [website, setWebsite] = useState('');
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [retryAfter, setRetryAfter] = useState(0);
  const configured = isFeedbackConfigured();
  const emailValid = isFeedbackEmailValid(email);
  const valid = Boolean(type && message.trim() && message.length <= FEEDBACK_MAX_LENGTH && emailValid);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!element.open) element.showModal();
    firstType.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    let active = true;
    const update = () => { void feedbackRetryAfter().then(seconds => { if (active) setRetryAfter(seconds); }); };
    update();
    const timer = window.setInterval(update, 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => { if (success) doneButton.current?.focus(); }, [success]);

  function close() {
    if (!busy.current) dialog.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !type || !valid || !configured || retryAfter > 0) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await sendFeedback({ type, message, email, website });
      setType('');
      setMessage('');
      setEmail('');
      setWebsite('');
      setSuccess(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '피드백을 보내지 못했어요. 잠시 후 다시 시도해주세요.');
      setRetryAfter(await feedbackRetryAfter());
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`} aria-busy={pending} onClose={onClose}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.content}>
      <button type="button" className={styles.close} aria-label="피드백 닫기" disabled={pending} onClick={close}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
      {success ? <div className={styles.success}>
        <svg className={styles.check} width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="2" /><path d="m14 24 7 7 13-14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 id={`${id}-title`}>소중한 의견 감사합니다!</h2>
        <p id={`${id}-description`}>보내주신 의견을 바탕으로 더 나은 MOEUM을 만들어갈게요.</p>
        <button ref={doneButton} type="button" className={ui.primaryButton} onClick={close}>확인</button>
      </div> : <>
        <header className={styles.heading}>
          <h2 id={`${id}-title`}>MOEUM에 의견을 들려주세요</h2>
          <p id={`${id}-description`}>여러분의 소중한 의견을 바탕으로 더 나은 MOEUM을 만들어갈게요.</p>
        </header>
        <form className={styles.form} onSubmit={event => void submit(event)} noValidate>
          <fieldset className={styles.fields} disabled={pending}>
            <fieldset className={styles.types}>
              <legend>피드백 유형 <span className={styles.required}>(필수)</span></legend>
              <div className={styles.chips}>
                {feedbackTypes.map((item, index) => <label className={styles.chip} key={item}>
                  <input ref={index === 0 ? firstType : undefined} type="radio" name={`${id}-type`} value={item}
                    checked={type === item} required onChange={() => setType(item)} />
                  <span>{item}</span>
                </label>)}
              </div>
            </fieldset>
            <div className={styles.field}>
              <label htmlFor={`${id}-message`}>상세 의견 <span className={styles.required}>(필수)</span></label>
              <textarea id={`${id}-message`} className={`${form.textarea} ${styles.textarea}`} required maxLength={FEEDBACK_MAX_LENGTH}
                placeholder="사용하면서 좋았던 점이나 불편했던 점을 자유롭게 알려주세요."
                value={message} onChange={event => setMessage(event.target.value)} aria-describedby={`${id}-count`} />
              <span id={`${id}-count`} className={styles.count}>{message.length}/{FEEDBACK_MAX_LENGTH}</span>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-email`}>이메일 <span className={styles.optional}>(선택)</span></label>
              <input id={`${id}-email`} className={`${form.input} ${styles.email}`} type="email" inputMode="email" autoComplete="email" maxLength={254}
                placeholder="답변을 받고 싶다면 이메일을 입력해주세요." value={email}
                onChange={event => setEmail(event.target.value)} onBlur={() => setEmailTouched(true)}
                aria-invalid={emailTouched && !emailValid || undefined} aria-describedby={emailTouched && !emailValid ? `${id}-email-error` : undefined} />
              {emailTouched && !emailValid && <p id={`${id}-email-error`} className={styles.error}>올바른 이메일 주소를 입력해주세요.</p>}
            </div>
            <div className={styles.honeypot} aria-hidden="true">
              <label htmlFor={`${id}-website`}>Website</label>
              <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
            </div>
          </fieldset>
          {!configured && <p className={styles.notice} role="status">피드백 전송이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {retryAfter > 0 && <p className={styles.notice} role="status">{retryAfter}초 후 다시 보낼 수 있어요.</p>}
          <div className={styles.actions}>
            <button type="button" className={ui.secondaryButton} disabled={pending} onClick={close}>취소</button>
            <button type="submit" className={ui.primaryButton} disabled={!valid || !configured || pending || retryAfter > 0}>
              {pending ? '보내는 중…' : '피드백 보내기'}
            </button>
          </div>
          {pending && <span className={ui.visuallyHidden} role="status">피드백을 보내고 있어요. 잠시만 기다려주세요.</span>}
        </form>
      </>}
    </div>
  </dialog>;
}

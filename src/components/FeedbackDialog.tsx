import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import closeIcon from '../../assets/icons/close.svg';
import { feedbackTypes, sendFeedback, type FeedbackType } from '../api/feedback';
import form from './form.module.css';
import ui from './ui.module.css';
import styles from './FeedbackDialog.module.css';

const maxLength = 500;

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState('');
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [status, setStatus] = useState<'editing' | 'sending' | 'sent'>('editing');
  const [error, setError] = useState('');
  const pending = status === 'sending';
  const sent = status === 'sent';
  const showEmailError = emailTouched && emailInvalid;
  const canSubmit = feedbackType !== null && !!message.trim() && !emailInvalid && !pending;

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => { if (sent) confirm.current?.focus(); }, [sent]);

  function close() {
    if (submitting.current) return;
    dialog.current?.close();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !feedbackType || submitting.current) return;
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    submitting.current = true;
    setStatus('sending');
    setError('');
    try {
      await sendFeedback({ type: feedbackType, message, email });
      setFeedbackType(null);
      setMessage('');
      setStatus('sent');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '전송에 실패했어요. 다시 시도해 주세요.');
      setStatus('editing');
    } finally {
      submitting.current = false;
    }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) close();
      }}>
      <div className={styles.content}>
        <button type="button" className={styles.close} aria-label="닫기" onClick={close} disabled={pending}>
          <img src={closeIcon} alt="" width="24" height="24" />
        </button>
        {sent && <svg className={styles.check} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="16" cy="16" r="13" />
          <path d="m10 16 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>}
        <header className={sent ? styles.successHeader : styles.header}>
          <h2 id={`${id}-title`}>{sent ? '소중한 의견 감사합니다!' : 'MOEUM에 의견을 들려주세요'}</h2>
          <p id={`${id}-description`}>{sent
            ? '보내주신 의견을 바탕으로 더 나은 MOEUM을 만들어갈게요.'
            : '여러분의 소중한 의견을 바탕으로 더 나은 MOEUM을 만들어갈게요.'}</p>
        </header>
        {sent ? (
          <button type="button" ref={confirm} className={ui.primaryButton} onClick={close}>확인</button>
        ) : (
          <form className={styles.form} onSubmit={submit} aria-busy={pending}>
            <fieldset className={styles.types} disabled={pending}>
              <legend className={styles.label}>피드백 유형 <span>(필수)</span></legend>
              <div className={styles.chips}>
                {feedbackTypes.map(type => (
                  <label key={type} className={styles.chip}>
                    <input type="radio" name="feedbackType" className={ui.visuallyHidden} required
                      value={type} checked={feedbackType === type} onChange={() => setFeedbackType(type)} />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className={form.field}>
              <label htmlFor={`${id}-message`} className={styles.label}>상세 의견 <span>(필수)</span></label>
              <textarea id={`${id}-message`} className={`${form.textarea} ${styles.message}`} required maxLength={maxLength}
                placeholder="사용하면서 좋았던 점이나 불편했던 점을 자유롭게 알려주세요."
                aria-describedby={`${id}-count`} value={message} disabled={pending} onChange={e => setMessage(e.target.value)} />
              <span id={`${id}-count`} className={styles.counter}>{message.length}/{maxLength}</span>
            </div>
            <div className={form.field}>
              <label htmlFor={`${id}-email`} className={styles.label}>이메일 <span>(선택)</span></label>
              <input id={`${id}-email`} className={`${form.input} ${styles.email}`} type="email" name="email"
                autoComplete="email" placeholder="답변을 받고 싶다면 이메일을 입력해주세요." disabled={pending}
                aria-invalid={showEmailError || undefined} aria-describedby={showEmailError ? `${id}-email-error` : undefined}
                onBlur={() => setEmailTouched(true)} onChange={e => setEmailInvalid(!e.currentTarget.validity.valid)} />
              {showEmailError && <p id={`${id}-email-error`} className={form.error}>올바른 이메일 주소를 입력해 주세요.</p>}
            </div>
            {error && <p className={form.error} role="alert">{error}</p>}
            <div className={styles.actions}>
              <button type="button" className={ui.secondaryButton} disabled={pending} onClick={close}>취소</button>
              <button type="submit" className={ui.primaryButton} disabled={!canSubmit}>
                {pending ? '전송 중…' : '피드백 보내기'}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

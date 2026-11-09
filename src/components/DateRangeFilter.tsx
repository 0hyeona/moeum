import { useEffect, useId, useRef, useState } from 'react';
import filter from './FilterSelect.module.css';
import styles from './DateRangeFilter.module.css';

export type DateRange = { start: string; end: string };
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
function key(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function DateRangeFilter({ value, onChange }: { value: DateRange | null; onChange: (value: DateRange | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | null>(value);
  const [month, setMonth] = useState(new Date());
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const year = month.getFullYear(), index = month.getMonth();
  const first = new Date(year, index, 1).getDay();
  const count = new Date(year, index + 1, 0).getDate();
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus(); }
  function choose(day: string) {
    if (!draft || draft.end) setDraft({ start: day, end: '' });
    else setDraft({ start: day < draft.start ? day : draft.start, end: day < draft.start ? draft.start : day });
  }
  return <>
    <button ref={trigger} type="button" className={filter.select} data-active={!!value} aria-haspopup="dialog" aria-expanded={open} onClick={() => {
      setDraft(value);
      setMonth(value ? new Date(Number(value.start.slice(0, 4)), Number(value.start.slice(5, 7)) - 1, 1) : new Date());
      setOpen(true);
    }}>{value ? `${value.start} – ${value.end}` : '전체 기간'}</button>
    {open && <dialog ref={dialog} className={styles.dialog} aria-labelledby={id} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={styles.content}>
        <header className={styles.header}><h2 id={id}>기간 선택</h2><button type="button" aria-label="닫기" onClick={close}>×</button></header>
        <p className={styles.hint}>시작일과 종료일을 선택해 주세요.</p>
        <div className={styles.range}><span>시작일<strong>{draft?.start || '날짜 선택'}</strong></span><span aria-hidden="true">—</span><span>종료일<strong>{draft?.end || '날짜 선택'}</strong></span></div>
        <nav className={styles.month} aria-label="달 이동"><button type="button" aria-label="이전 달" onClick={() => setMonth(new Date(year, index - 1, 1))}>‹</button><strong aria-live="polite">{year}년 {index + 1}월</strong><button type="button" aria-label="다음 달" onClick={() => setMonth(new Date(year, index + 1, 1))}>›</button></nav>
        <div className={styles.grid}>
          {weekdays.map(day => <span className={styles.weekday} key={day}>{day}</span>)}
          {Array.from({ length: first }, (_, i) => <span key={`empty-${i}`} />)}
          {Array.from({ length: count }, (_, i) => {
            const date = key(new Date(year, index, i + 1));
            const edge = date === draft?.start || date === draft?.end;
            const inside = draft?.end && date > draft.start && date < draft.end;
            return <button type="button" key={date} className={`${styles.day} ${edge ? styles.edge : ''} ${inside ? styles.inside : ''}`} aria-label={date} aria-pressed={edge || !!inside} aria-current={date === key(new Date()) ? 'date' : undefined} onClick={() => choose(date)}>{i + 1}</button>;
          })}
        </div>
        <footer className={styles.actions}><button type="button" onClick={() => setDraft(null)}>초기화</button><button type="button" onClick={close}>취소</button><button type="button" className={styles.apply} disabled={!!draft && !draft.end} onClick={() => { onChange(draft); close(); }}>적용</button></footer>
      </div>
    </dialog>}
  </>;
}

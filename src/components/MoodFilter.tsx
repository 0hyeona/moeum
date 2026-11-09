import { useEffect, useRef, useState } from 'react';
import type { FilterOption } from './FilterSelect';
import styles from './MoodFilter.module.css';

export function MoodFilter<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly FilterOption<T>[]; onChange: (value: T) => void;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && root.current) root.current.open = false; };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <details ref={root} className={styles.root} onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); if (root.current) root.current.open = false; trigger.current?.focus(); }
  }}>
    <summary ref={trigger} className={`${styles.trigger} ${value !== 'all' ? styles.active : ''}`} aria-label={`${label}: ${options.find(item => item.value === value)?.label}`}>
      {options.find(item => item.value === value)?.label}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </summary>
    <div className={styles.menu} aria-label={label}>
      {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => {
        onChange(option.value); if (root.current) root.current.open = false; trigger.current?.focus();
      }}><span>{option.label}</span>{value === option.value && <span aria-hidden="true">✓</span>}</button>)}
    </div>
  </details>;
}

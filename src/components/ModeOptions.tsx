import { useId } from 'react';
import { analysisModes, type AnalysisMode } from '../data/projects';
import form from './form.module.css';
import styles from './ModeOptions.module.css';

type ModeOptionsProps = {
  value: AnalysisMode;
  onChange?: (mode: AnalysisMode) => void;
  options?: readonly AnalysisMode[];
  label?: string;
};

// onChange가 없으면 고른 방식 하나만 읽기 전용으로 보여줍니다(s6 분석 결과 화면).
export function ModeOptions({ value, onChange, options = analysisModes, label = '분석 방식' }: ModeOptionsProps) {
  const name = useId();
  if (!onChange) {
    return (
      <p className={styles.readOnly}>
        <span className={styles.mark} aria-hidden="true" />
        {value}
      </p>
    );
  }

  return (
    <div className={styles.options} role="radiogroup" aria-label={label}>
      {options.map((mode) => (
        <label key={mode} className={styles.option}>
          <input type="radio" name={name} className={form.radio} value={mode} checked={value === mode} onChange={() => onChange(mode)} />
          {mode}
        </label>
      ))}
    </div>
  );
}

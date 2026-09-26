import styles from './FilterSelect.module.css';

export type FilterOption<T extends string> = { value: T; label: string };

type FilterSelectProps<T extends string> = {
  label: string;
  value: T;
  options: readonly FilterOption<T>[];
  onChange: (value: T) => void;
  className?: string;
};

// 화면의 드롭다운 버튼 모양을 입힌 기본 select라서 키보드와 스크린리더 동작은 브라우저 기본을 따릅니다.
export function FilterSelect<T extends string>({ label, value, options, onChange, className }: FilterSelectProps<T>) {
  return (
    <select className={`${styles.select} ${className ?? ''}`} aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

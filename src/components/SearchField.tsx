import searchIcon from '../../assets/icons/search.svg';
import styles from './SearchField.module.css';

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
};

export function SearchField({ value, onChange, label, placeholder, className }: SearchFieldProps) {
  return (
    <div className={`${styles.search} ${className ?? ''}`} role="search">
      <img src={searchIcon} alt="" width="16" height="16" />
      <input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

import closeIcon from '../../assets/icons/close.svg';
import type { Change } from '../data/projects';
import { Badge, ServiceIcon } from './ui';
import styles from './SelectedChangeCard.module.css';

export function SelectedChangeCard({ change, onRemove }: { change: Change; onRemove?: () => void }) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <ServiceIcon service={change.service} />
        <h3>{change.service} {change.reference}</h3>
        {onRemove && (
          <button type="button" className={styles.remove} onClick={onRemove} aria-label={`${change.title} 선택 해제`}>
            <img src={closeIcon} alt="" width="24" height="24" />
          </button>
        )}
      </div>
      <p className={styles.title}>{change.title}</p>
      {change.labels.length > 0 && (
        <div className={styles.labels}>
          {change.labels.map((label) => <Badge key={label}>{label}</Badge>)}
        </div>
      )}
    </div>
  );
}

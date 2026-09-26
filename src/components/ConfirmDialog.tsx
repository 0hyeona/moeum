import { useEffect, useId, useRef } from 'react';
import ui from './ui.module.css';
import styles from './ConfirmDialog.module.css';

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// 여는 동안에만 렌더링하는 확인창입니다. 마운트되면 모달로 열리고 취소 버튼에 먼저 포커스를 둡니다.
// 취소 버튼·Esc·바깥 클릭은 모두 dialog를 닫고, 닫히면 onCancel이 호출됩니다.
export function ConfirmDialog({ title, description, confirmLabel, cancelLabel = '취소', onConfirm, onCancel }: ConfirmDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    element.showModal();
    cancelButton.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onClose={onCancel}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    >
      <div className={styles.content}>
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-description`}>{description}</p>
        <div className={styles.actions}>
          <button ref={cancelButton} type="button" className={`${ui.secondaryButton} ${styles.cancel}`} onClick={() => dialog.current?.close()}>{cancelLabel}</button>
          <button type="button" className={ui.dangerButton} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

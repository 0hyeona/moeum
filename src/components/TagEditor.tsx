import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import plusIcon from '../../assets/icons/plus.svg';
import tagCloseIcon from '../../assets/icons/tag-close.svg';
import styles from './TagEditor.module.css';

const maxTagLength = 20;

type TagEditorProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
  label?: string;
};

export function TagEditor({ tags, onChange, label = '태그' }: TagEditorProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  // 입력창이 닫히거나 태그가 지워져 포커스가 사라질 때 '태그 추가' 버튼으로 돌려놓습니다.
  const focusAddButton = useRef(false);
  const skipBlur = useRef(false);

  useEffect(() => {
    if (!focusAddButton.current || !addButton.current) return;
    focusAddButton.current = false;
    addButton.current.focus();
  });

  function add(value: string) {
    const tag = value.trim().slice(0, maxTagLength);
    if (tag && !tags.some((item) => item.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag]);
  }

  function open() {
    skipBlur.current = false;
    setAdding(true);
  }

  function close(restoreFocus: boolean) {
    skipBlur.current = true;
    focusAddButton.current = restoreFocus;
    setDraft('');
    setAdding(false);
  }

  function remove(tag: string) {
    focusAddButton.current = true;
    onChange(tags.filter((item) => item !== tag));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 중에 누른 Enter는 조합을 끝내는 입력이라 태그로 추가하지 않습니다.
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (draft.trim()) {
        add(draft);
        setDraft('');
      } else {
        close(true);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  }

  function handleBlur() {
    // Enter·Esc로 이미 닫은 입력창이 사라지면서 생기는 blur는 무시합니다.
    if (skipBlur.current) return;
    add(draft);
    close(false);
  }

  return (
    <ul className={styles.list} aria-label={label}>
      {tags.map((tag) => (
        <li key={tag} className={styles.tag}>
          {tag}
          <button type="button" onClick={() => remove(tag)} aria-label={`${tag} 태그 삭제`}>
            <img src={tagCloseIcon} alt="" width="18" height="18" />
          </button>
        </li>
      ))}
      <li>
        {adding ? (
          <input
            className={styles.input}
            aria-label="추가할 태그"
            placeholder="태그 입력"
            maxLength={maxTagLength}
            autoComplete="off"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
        ) : (
          <button ref={addButton} type="button" className={styles.add} onClick={open}>
            <img src={plusIcon} alt="" width="18" height="18" />
            태그 추가
          </button>
        )}
      </li>
    </ul>
  );
}

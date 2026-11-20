import styles from './Skeleton.module.css';

export function Skeleton({ variant = 'line' }: { variant?: 'line' | 'short' | 'title' | 'input' | 'button' | 'avatar' }) {
  return <span className={`${styles.bone} ${styles[variant]}`} />;
}

export function FormSkeleton({ fields = 2 }: { fields?: number }) {
  return <div className={styles.form} aria-hidden="true">
    {Array.from({ length: fields }, (_, index) => <div className={styles.field} key={index}>
      <Skeleton variant="short" /><Skeleton variant="input" />
    </div>)}
    <Skeleton variant="button" />
  </div>;
}

export function StorySkeleton({ editing = false }: { editing?: boolean }) {
  const fields = (count: number) => Array.from({ length: count }, (_, index) => (
    <div className={styles.storyField} key={index}>
      <Skeleton variant="short" />
      <div className={styles.storyContent}><Skeleton /><Skeleton /><Skeleton variant="short" /></div>
    </div>
  ));
  return <div className={styles.storyPage} role="status" aria-busy="true" aria-label="Story를 불러오는 중">
    <div aria-hidden="true">
      <div className={styles.storyHeading}><Skeleton variant="title" /></div>
      <div className={`${styles.storyColumns} ${editing ? styles.storyEditing : ''}`}>
        <div className={styles.panel}>
          {!editing && <Skeleton variant="short" />}
          <div className={styles.storyField}><Skeleton variant="short" /><Skeleton variant="input" /></div>
          {fields(3)}
        </div>
        {editing ? <div className={styles.storySide}>
          <div className={styles.panel}><Skeleton variant="short" /><Skeleton /></div>
          <div className={styles.panel}><Skeleton variant="short" /><div className={styles.storyMemo}><Skeleton /><Skeleton /><Skeleton variant="short" /></div></div>
        </div> : <div className={styles.panel}>{fields(3)}</div>}
      </div>
    </div>
  </div>;
}

export function AuthSkeleton() {
  return <div aria-busy="true" role="status" aria-label="GitHub 로그인 정보를 확인하고 있습니다.">
    <div className={styles.auth} aria-hidden="true"><Skeleton variant="title" /><Skeleton /><FormSkeleton /></div>
  </div>;
}

export function SessionSkeleton() {
  return <main className={styles.session} aria-busy="true" role="status" aria-label="로그인 정보와 화면을 불러오고 있습니다.">
    <div aria-hidden="true">
      <div className={styles.header}><Skeleton variant="title" /><div className={styles.profile}><Skeleton variant="short" /><Skeleton variant="avatar" /></div></div>
      <div className={styles.body}>
        <div className={styles.heading}><Skeleton variant="title" /><Skeleton variant="short" /></div>
        <div className={styles.grid}>{Array.from({ length: 4 }, (_, index) => <div className={styles.panel} key={index}>
          <Skeleton variant="title" /><Skeleton /><Skeleton /><Skeleton variant="short" />
        </div>)}</div>
      </div>
    </div>
  </main>;
}

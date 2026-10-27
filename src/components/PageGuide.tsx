import { useId, useRef, useState } from 'react';
import floatingGuide from '../../assets/icons/floating-guide.svg';
import styles from './PageGuide.module.css';

function getGuide(pathname: string): string | undefined {
  switch (pathname.replace(/\/$/, '')) {
    case '/projects': return '프로젝트를 선택하고 기록을 시작해보세요.';
    case '/projects/new': return '사용하는 작업 도구를 연결해보세요.';
    case '/dashboard': return '최근 작업과 기록 현황을 확인해보세요.';
    case '/changes': return 'Story로 남길 작업을 선택해보세요.';
    case '/stories/analysis': return '선택한 기록을 AI가 정리해드려요.';
    case '/stories/new': return 'AI 초안에 나만의 경험을 더해보세요.';
    case '/timeline': return '프로젝트의 흐름을 타임라인으로 확인해보세요.';
    case '/settings': return '프로젝트와 연결 서비스를 관리해보세요.';
    default:
      if (/^\/stories\/[^/]+\/edit\/?$/.test(pathname)) return 'AI 초안에 나만의 경험을 더해보세요.';
      if (/^\/stories\/[^/]+\/?$/.test(pathname)) return '작업 과정과 결과를 자세히 확인해보세요.';
      return undefined;
  }
}

export function PageGuide({ pathname }: { pathname: string }) {
  const descriptionId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const guide = getGuide(pathname);

  if (!guide) return null;

  return <div ref={container} className={styles.guide}
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => {
      if (document.activeElement !== button.current) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') setOpen(false);
    }}>
    <div id={descriptionId} role="tooltip" className={`${styles.tooltip} ${open ? styles.open : ''}`}>
      {guide}
    </div>
    <button ref={button} type="button" className={styles.button}
      aria-label="이 화면의 활동 안내" aria-describedby={descriptionId}
      onFocus={() => setOpen(true)}
      onBlur={() => {
        if (!container.current?.matches(':hover')) setOpen(false);
      }}
      onClick={() => setOpen(true)}>
      <span className={styles.icon} aria-hidden="true">
        <img src={floatingGuide} alt="" />
      </span>
    </button>
  </div>;
}

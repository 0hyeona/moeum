import { useEffect, type ReactNode } from 'react';
import githubIcon from '../../assets/icons/github.svg';
import figmaIcon from '../../assets/icons/figma.svg';
import notionIcon from '../../assets/icons/notion.svg';
import type { ProjectStatus, Service, StoryStatus } from '../data/projects';
import styles from './ui.module.css';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · 모음`;
  }, [title]);
}

export function PageHeading({ title, description }: { title: string; description?: string }) {
  return (
    <header className={styles.pageHeading}>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}

type BadgeTone = 'green' | 'blue' | 'yellow' | 'gray';
const statusTones: Partial<Record<ProjectStatus | StoryStatus, BadgeTone>> = { '진행 중': 'green', '완료': 'blue', '초안': 'yellow' };

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: ProjectStatus | StoryStatus }) {
  return <Badge tone={statusTones[status]}>{status}</Badge>;
}

const serviceIcons: Record<Service, { src: string; width: number; height: number }> = {
  GitHub: { src: githubIcon, width: 24, height: 23.4079 },
  Figma: { src: figmaIcon, width: 12, height: 18 },
  Notion: { src: notionIcon, width: 24, height: 24 },
};

// Figma 아이콘은 폭이 좁아서, 모든 아이콘을 같은 크기의 정사각형 칸 가운데에 둡니다.
export function ServiceIcon({ service, size = 24 }: { service: Service; size?: number }) {
  const icon = serviceIcons[service];
  const scale = size / 24;
  return (
    <span className={styles.serviceIcon} style={{ width: size, height: size }}>
      <img src={icon.src} alt="" width={icon.width * scale} height={icon.height * scale} />
    </span>
  );
}

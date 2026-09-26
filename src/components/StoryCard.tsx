import { Link } from 'react-router';
import type { Story } from '../data/projects';
import { StatusBadge } from './ui';
import styles from './StoryCard.module.css';

export function StoryCard({ story, className }: { story: Story; className?: string }) {
  return (
    <Link to={`/stories/${story.id}`} className={`${styles.card} ${className ?? ''}`}>
      <StatusBadge status={story.status} />
      <span className={styles.text}>
        <strong className={styles.title}>{story.title}</strong>
        <span className={styles.summary}>{story.summary}</span>
        <TagList tags={story.tags} className={styles.cardTags} />
      </span>
      <time className={styles.date} dateTime={story.date.replaceAll('.', '-')}>{story.date}</time>
    </Link>
  );
}

export function TagList({ tags, className }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <span className={`${styles.tags} ${className ?? ''}`}>
      {tags.map((tag) => <span key={tag} className={styles.tag}>{tag}</span>)}
    </span>
  );
}

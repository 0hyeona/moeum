import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { Story } from '../data/projects';
import { useProjects, useStory } from '../state/ProjectsContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeading, StatusBadge, useDocumentTitle } from '../components/ui';
import ui from '../components/ui.module.css';
import styles from './StoryDetailPage.module.css';

const emptyText = '작성하지 않았어요.';

// 파일 이름에 쓸 수 없는 문자를 바꾸고 50자로 줄입니다. 앞뒤 마침표는 숨김 파일이나 확장자와 헷갈리지 않도록 지웁니다.
function toFileName(title: string) {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
  // 이모지 같은 문자가 반으로 잘리지 않도록 코드 포인트 단위로 자릅니다.
  const name = Array.from(cleaned).slice(0, 50).join('').replace(/^[.\s]+|[.\s]+$/g, '');
  return `${name || 'story'}.md`;
}

function toMarkdown(story: Story) {
  const section = (heading: string, text: string) => `## ${heading}\n\n${text.trim() || `_${emptyText}_`}\n`;
  return [
    `# ${story.title.trim() || '제목 없음'}\n`,
    `- 상태: ${story.status}\n- 작성일: ${story.date}\n- 출처: ${story.sources.join(', ') || '-'}\n- 태그: ${story.tags.join(', ') || '-'}\n`,
    section('Why', story.why),
    section('문제', story.problem),
    section('해결과정', story.solution),
    section('결과', story.result),
    section('AI 요약', story.summary),
    section('배운점', story.learned),
    section('후속과제', story.next),
    section('Before', story.before),
    section('After', story.after),
    section('메모', story.memo),
  ].join('\n');
}

function downloadMarkdown(story: Story) {
  const url = URL.createObjectURL(new Blob([toMarkdown(story)], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = toFileName(story.title);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function StoryDetailPage() {
  useDocumentTitle('Story 기록 보기');
  const { storyId } = useParams();
  const { activeProject: project, deleteStory } = useProjects();
  const { story, switching } = useStory(storyId);
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  if (!project) return <Navigate to="/projects" replace />;

  if (!story) {
    if (switching) return null;
    return (
      <div className={styles.page}>
        <PageHeading title="Story 기록 보기" />
        <div className={styles.notFound}>
          <p>Story를 찾을 수 없어요.</p>
          <Link to="/timeline">타임라인으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  const remove = () => {
    deleteStory(story.id);
    navigate('/timeline', { replace: true });
  };

  return (
    <div className={styles.page}>
      <PageHeading title="Story 기록 보기" />
      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="story-record-heading">
          <h2 id="story-record-heading" className={ui.visuallyHidden}>Story 기록</h2>
          <div className={styles.meta}>
            {story.tags.length > 0 && (
              <ul className={styles.tags} aria-label="태그">
                {story.tags.map((tag) => <li key={tag} className={styles.tag}>{tag}</li>)}
              </ul>
            )}
            <div className={styles.status}>
              <StatusBadge status={story.status} />
              <time dateTime={story.date.replaceAll('.', '-')}>{story.date}</time>
            </div>
          </div>
          <dl className={`${styles.fields} ${styles.underlined}`}>
            <Field label="Story 제목" text={story.title} single />
            <Field label="Why" text={story.why} />
            <Field label="문제" text={story.problem} />
            <Field label="해결과정" text={story.solution} />
            <Field label="결과" text={story.result} />
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="story-summary-heading">
          <h2 id="story-summary-heading" className={ui.visuallyHidden}>요약과 메모</h2>
          <dl className={styles.fields}>
            <Field label="AI 요약" text={story.summary} />
            <Field label="배운점" text={story.learned} />
            {story.next.trim() && <Field label="후속과제" text={story.next} />}
            <div className={styles.field}>
              <dt className={styles.label}>Before / After</dt>
              <dd className={styles.comparison}>
                <dl className={styles.comparisonList}>
                  <Field label="Before" text={story.before} labelClassName={styles.before} />
                  <Field label="After" text={story.after} labelClassName={styles.after} />
                </dl>
              </dd>
            </div>
            <Field label="메모" text={story.memo} />
          </dl>
        </section>
      </div>

      <div className={styles.actions}>
        <Link to={`/stories/${story.id}/edit`} className={`${ui.secondaryButton} ${styles.button} ${styles.editButton}`}>수정</Link>
        <button type="button" className={`${ui.secondaryButton} ${styles.button} ${styles.deleteButton}`} onClick={() => setConfirmingDelete(true)}>삭제</button>
        <button type="button" className={`${ui.primaryButton} ${styles.exportButton}`} onClick={() => downloadMarkdown(story)}>내보내기</button>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Story를 삭제할까요?"
          description="삭제한 Story는 되돌릴 수 없어요."
          confirmLabel="삭제"
          onConfirm={remove}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

type FieldProps = { label: string; text: string; single?: boolean; labelClassName?: string };

function Field({ label, text, single = false, labelClassName }: FieldProps) {
  const value = text.trim();
  return (
    <div className={styles.field}>
      <dt className={labelClassName ?? styles.label}>{label}</dt>
      <dd className={`${styles.value} ${single ? styles.single : ''} ${value ? '' : styles.empty}`}>{value || emptyText}</dd>
    </div>
  );
}

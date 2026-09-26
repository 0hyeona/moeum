import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { emptyStoryFields, type StoryFields } from '../data/projects';
import { useProjects, useStory } from '../state/ProjectsContext';
import { TagEditor } from '../components/TagEditor';
import { PageHeading, useDocumentTitle } from '../components/ui';
import form from '../components/form.module.css';
import ui from '../components/ui.module.css';
import styles from './StoryWritePage.module.css';

const description = 'Story 제목을 제외한 항목은 자유롭게 작성할 수 있어요. 작성 중인 내용은 페이지를 이동해도 유지되며, 새로고침하면 초기화됩니다.';

type TextFieldKey = 'why' | 'problem' | 'solution' | 'result' | 'learned' | 'next';

const textFields: readonly { key: TextFieldKey; label: string; hint?: string; placeholder: string }[] = [
  { key: 'why', label: 'Why', hint: '선택', placeholder: '이 작업을 시작하게 된 배경이나 이유를 작성해주세요.' },
  { key: 'problem', label: '문제', placeholder: '작업 과정에서 발견한 문제나 개선이 필요했던 점을 작성해주세요.' },
  { key: 'solution', label: '해결과정', placeholder: '문제를 해결하기 위해 어떤 방법을 시도했는지 작성해주세요.' },
  { key: 'result', label: '결과', placeholder: '작업을 통해 무엇이 달라졌는지 작성해주세요.' },
  { key: 'learned', label: '배운 점', placeholder: '이번 작업을 통해 새롭게 알게 된 점이나 느낀 점을 작성해주세요.' },
  { key: 'next', label: '후속과제', placeholder: '추가로 개선하거나 다음에 시도해보고 싶은 내용을 작성해주세요.' },
];

export function StoryWritePage() {
  const { storyId } = useParams();
  const editing = storyId !== undefined;
  const title = editing ? 'Story 수정' : 'Story 작성';
  useDocumentTitle(title);
  const { activeProject: project, analysis } = useProjects();
  const { story, switching } = useStory(storyId);
  if (!project) return <Navigate to="/projects" replace />;

  if (editing && !story) {
    if (switching) return null;
    return (
      <div className={styles.page}>
        <PageHeading title={title} />
        <div className={styles.notFound}>
          <p>Story를 찾을 수 없어요.</p>
          <Link to="/timeline">타임라인으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  // 새 Story는 s6 분석 결과(제목·태그·요약·변경 전후)로 채워서 시작합니다.
  let initialFields = emptyStoryFields;
  let aiTags: readonly string[] = [];
  if (story) {
    initialFields = storyFields(story);
  } else if (analysis) {
    const { title, tags, summary, before, after } = analysis;
    initialFields = { ...emptyStoryFields, title, tags, summary, before, after };
    aiTags = tags;
  }

  return (
    <StoryForm
      key={JSON.stringify([project.id, storyId ?? 'new', storyId ? [] : [...(analysis?.changeIds ?? [])].sort()])}
      heading={title}
      storyId={story?.id}
      initialFields={initialFields}
      aiTags={aiTags}
    />
  );
}

// Story의 id·상태·날짜 등은 빼고 작성 화면에서 다루는 항목만 꺼냅니다.
function storyFields({ title, why, problem, solution, result, learned, next, memo, summary, before, after, tags }: StoryFields): StoryFields {
  return { title, why, problem, solution, result, learned, next, memo, summary, before, after, tags };
}

type StoryFormProps = {
  heading: string;
  storyId?: string;
  initialFields: StoryFields;
  aiTags: readonly string[];
};

// 직접 입력한 필드는 페이지 이동 후에도 복원하고, 나머지는 최신 분석 결과로 채웁니다.
function StoryForm({ heading, storyId, initialFields, aiTags }: StoryFormProps) {
  const { saveStory, getStoryDraft, updateStoryDraft } = useProjects();
  const navigate = useNavigate();
  const titleInput = useRef<HTMLInputElement>(null);
  const fields = { ...initialFields, ...getStoryDraft(storyId) };
  const [titleError, setTitleError] = useState('');
  // 같은 오류로 다시 제출해도 스크린 리더가 알림을 다시 읽도록 매번 새로 렌더링합니다.
  const [errorCount, setErrorCount] = useState(0);
  // AI가 제안한 태그가 하나라도 남아 있을 때만 'AI 생성' 표시를 보여줍니다.
  const showAiBadge = fields.tags.some((tag) => aiTags.includes(tag));

  function update<K extends keyof StoryFields>(key: K, value: StoryFields[K]) {
    updateStoryDraft({ [key]: value }, storyId);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = fields.title.trim();
    if (!title) {
      setTitleError('Story 제목을 입력해주세요.');
      setErrorCount((count) => count + 1);
      titleInput.current?.focus();
      return;
    }
    const id = saveStory({ ...fields, title }, storyId);
    navigate(`/stories/${id}`, { replace: true });
  }

  return (
    <div className={styles.page}>
      <PageHeading title={heading} description={description} />
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.columns}>
          <div className={`${styles.panel} ${styles.template}`}>
            <div className={form.field}>
              <div className={form.labelRow}>
                <label htmlFor="story-title" className={form.label}>Story 제목</label>
                <span className={form.hint}>필수</span>
              </div>
              <input
                ref={titleInput}
                id="story-title"
                className={form.input}
                placeholder="이번 작업을 한 문장으로 요약해보세요."
                maxLength={100}
                autoComplete="off"
                value={fields.title}
                onChange={(event) => {
                  update('title', event.target.value);
                  setTitleError('');
                }}
                aria-invalid={!!titleError}
                aria-describedby={titleError ? 'story-title-error' : undefined}
                required
              />
              {titleError && (
                <p key={errorCount} className={form.error} id="story-title-error" role="alert">
                  {titleError}
                </p>
              )}
            </div>
            {textFields.map((field) => (
              <div key={field.key} className={form.field}>
                <div className={form.labelRow}>
                  <label htmlFor={`story-${field.key}`} className={form.label}>{field.label}</label>
                  {field.hint && <span className={form.hint}>{field.hint}</span>}
                </div>
                <textarea
                  id={`story-${field.key}`}
                  className={form.textarea}
                  rows={1}
                  placeholder={field.placeholder}
                  value={fields[field.key]}
                  onChange={(event) => update(field.key, event.target.value)}
                />
              </div>
            ))}
          </div>

          <div className={styles.side}>
            <section className={`${styles.panel} ${styles.tags}`} aria-labelledby="story-tags-heading">
              <div className={styles.tagsHeading}>
                <h2 id="story-tags-heading">태그</h2>
                {showAiBadge && <span className={`${ui.badge} ${ui.blue} ${styles.aiBadge}`}>AI 생성</span>}
              </div>
              <TagEditor tags={fields.tags} onChange={(tags) => update('tags', tags)} />
            </section>
            <div className={`${styles.panel} ${styles.memo} ${form.field}`}>
              <label htmlFor="story-memo" className={form.label}>메모</label>
              <textarea
                id="story-memo"
                className={form.textarea}
                placeholder="회고에 참고할 내용이나 기억해두고 싶은 내용을 자유롭게 작성해주세요."
                value={fields.memo}
                onChange={(event) => update('memo', event.target.value)}
              />
            </div>
          </div>
        </div>
        <button type="submit" className={ui.primaryButton}>{storyId ? '수정 완료' : 'Story 작성 완료'}</button>
      </form>
    </div>
  );
}

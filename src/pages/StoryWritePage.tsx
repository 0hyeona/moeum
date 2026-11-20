import { StorySkeleton } from '../components/Skeleton';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { emptyStoryFields, type Story, type StoryFields } from '../data/projects';
import { useProjects, useStory } from '../state/ProjectsContext';
import { TagEditor } from '../components/TagEditor';
import { storyDraftFromAnalysis } from '../data/storyDraft';
import { PageHeading, useDocumentTitle } from '../components/ui';
import form from '../components/form.module.css';
import ui from '../components/ui.module.css';
import styles from './StoryWritePage.module.css';

type TextFieldKey = 'why' | 'problem' | 'solution' | 'result' | 'learned' | 'next';

const textFields: readonly { key: TextFieldKey; label: string; placeholder: string }[] = [
  { key: 'why', label: 'Why', placeholder: '이 작업을 시작하게 된 배경이나 이유를 작성해주세요.' },
  { key: 'problem', label: '문제', placeholder: '작업 과정에서 발견한 문제나 개선이 필요했던 점을 작성해주세요.' },
  { key: 'solution', label: '해결과정', placeholder: '문제를 해결하기 위해 어떤 방법을 시도했는지 작성해주세요.' },
  { key: 'result', label: '결과', placeholder: '작업을 통해 무엇이 달라졌는지 작성해주세요.' },
  { key: 'learned', label: '배운 점', placeholder: '이번 작업을 통해 새롭게 알게 된 점이나 느낀 점을 작성해주세요.' },
  { key: 'next', label: '후속과제', placeholder: '추가로 개선하거나 다음에 시도해보고 싶은 내용을 작성해주세요.' },
];

export function StoryWritePage() {
  const { storyId } = useParams();
  const { activeProject: project, clearAnalysis } = useProjects();
  const { story, switching, error, retry } = useStory(storyId);
  useEffect(() => { if (storyId) clearAnalysis(); }, [storyId, clearAnalysis]);
  useDocumentTitle(story?.status === '완료' ? 'Story 수정' : 'Story 작성');
  if (!project) return <Navigate to="/projects" replace />;
  if (!storyId) return <NewStory key={project.id} />;
  if (switching) return <StorySkeleton editing />;
  if (error || !story) return <div className={styles.notFound}>
    <p role="alert">{error || 'Story를 찾을 수 없어요.'}</p>
    <button type="button" className={ui.secondaryButton} onClick={retry}>다시 불러오기</button>
    <Link to="/timeline">타임라인으로 돌아가기</Link>
  </div>;
  return <StoryForm key={story.id} story={story} />;
}

function NewStory() {
  const { createStoryDraft } = useProjects();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!title.trim()) { setError('Story 제목을 입력해주세요.'); return; }
    lock.current = true;
    setPending(true);
    setError('');
    try {
      const id = await createStoryDraft({ ...emptyStoryFields, title: title.trim() });
      navigate(`/stories/${id}/edit`, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '초안을 저장하지 못했어요.'); }
    finally { lock.current = false; setPending(false); }
  }
  return <div className={styles.page}>
    <PageHeading title="Story 직접 작성" description="제목을 입력하면 초안을 만들고 회고 작성을 시작해요." />
    <form className={styles.newStory} onSubmit={create}>
      <label className={form.label} htmlFor="new-story-title">Story 제목</label>
      <input id="new-story-title" className={form.input} value={title} maxLength={200} required disabled={pending} onChange={event => setTitle(event.target.value)} />
      {error && <p role="alert" className={form.error}>{error}</p>}
      <button className={ui.primaryButton} disabled={pending}>{pending ? '초안 저장 중…' : '초안 만들고 작성하기'}</button>
    </form>
  </div>;
}

// Story의 id·상태·날짜 등은 빼고 작성 화면에서 다루는 항목만 꺼냅니다.
function storyFields({ title, why, problem, solution, result, learned, next, memo, summary, before, after, tags }: StoryFields): StoryFields {
  return { title, why, problem, solution, result, learned, next, memo, summary, before, after, tags };
}

function StoryForm({ story }: { story: Story }) {
  const { saveStory, getStoryDraft, updateStoryDraft } = useProjects();
  const storyId = story.id;
  const navigate = useNavigate();
  const titleInput = useRef<HTMLInputElement>(null);
  const draft = getStoryDraft(storyId) ?? {};
  const fields = { ...storyFields(story), ...draft };
  const recommendations = storyDraftFromAnalysis(story);
  const signature = JSON.stringify(draft);
  const dirty = Object.keys(draft).length > 0;
  const [titleError, setTitleError] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const action = useRef(false);
  const pending = useRef(0);
  const mounted = useRef(true);
  const submitted = useRef('');
  const latest = useRef({ fields, draft, dirty, signature });
  latest.current = { fields, draft, dirty, signature };
  const save = useRef(saveStory);
  save.current = saveStory;
  const heading = story.status === '완료' ? 'Story 수정' : 'Story 작성';

  async function persist(values: Partial<StoryFields>, status?: 'draft' | 'published') {
    pending.current++;
    submitted.current = JSON.stringify(values);
    if (mounted.current) { setSaving(true); setSaveError(''); }
    try { await save.current(values, storyId, status); return true; }
    catch (cause) {
      submitted.current = '';
      if (mounted.current) setSaveError(cause instanceof Error ? cause.message : '저장하지 못했어요. 입력 내용은 유지됩니다.');
      return false;
    } finally {
      pending.current--;
      if (mounted.current) setSaving(pending.current > 0);
    }
  }
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    if (!dirty || finishing || !fields.title.trim()) return;
    const timer = setTimeout(() => { void persistRef.current(latest.current.draft); }, 1000);
    return () => clearTimeout(timer);
  }, [signature, dirty, fields.title, finishing]);
  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty || pending.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', beforeUnload);
      const current = latest.current;
      if (!action.current && current.dirty && current.fields.title.trim() && submitted.current !== current.signature) {
        void persistRef.current(current.draft);
      }
    };
  }, []);

  function update<K extends keyof StoryFields>(key: K, value: StoryFields[K]) {
    updateStoryDraft({ [key]: value }, storyId);
    setSaveError('');
  }
  async function finish(status: 'draft' | 'published') {
    if (action.current) return;
    const title = fields.title.trim();
    if (!title) {
      setTitleError('Story 제목을 입력해주세요.');
      setErrorCount(count => count + 1);
      titleInput.current?.focus();
      return;
    }
    action.current = true;
    setFinishing(true);
    if (await persist({ ...fields, title }, status)) navigate(`/stories/${storyId}`, { replace: true });
    else { action.current = false; setFinishing(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void finish('published'); }

  return (
    <div className={styles.page}>
      <PageHeading title={heading} />
      <form className={styles.form} onSubmit={submit} noValidate>
        <fieldset className={styles.columns} disabled={finishing}>
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
                maxLength={200}
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
                  {fields[field.key] && fields[field.key] === recommendations[field.key] && <span className={styles.recommendation}>AI 추천 초안</span>}
                </div>
                <textarea
                  id={`story-${field.key}`}
                  className={form.textarea}
                  rows={1}
                  maxLength={15000}
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
              </div>
              <TagEditor tags={fields.tags} onChange={(tags) => update('tags', tags)} />
            </section>
            <div className={`${styles.panel} ${styles.memo} ${form.field}`}>
              <label htmlFor="story-memo" className={form.label}>메모</label>
              <textarea
                id="story-memo"
                className={form.textarea}
                maxLength={15000}
                placeholder="회고에 참고할 내용이나 기억해두고 싶은 내용을 자유롭게 작성해주세요."
                value={fields.memo}
                onChange={(event) => update('memo', event.target.value)}
              />
            </div>
          </div>
        </fieldset>
        <div className={styles.saveActions}>
          <p role="status">{saving ? '저장 중…' : dirty ? '저장되지 않은 변경사항이 있어요.' : '서버에 저장됐어요.'}</p>
          {saveError && <p className={form.error} role="alert">{saveError}</p>}
          {saveError && <button type="button" className={ui.secondaryButton} disabled={saving || finishing} onClick={() => void persist(draft)}>저장 다시 시도</button>}
          {story.status === '초안' && <button type="button" className={ui.secondaryButton} disabled={finishing} onClick={() => void finish('draft')}>초안 저장</button>}
          <button type="submit" className={ui.primaryButton} disabled={finishing}>{finishing ? '저장 중…' : story.status === '완료' ? '수정 완료' : 'Story 작성 완료'}</button>
        </div>
      </form>
    </div>
  );
}

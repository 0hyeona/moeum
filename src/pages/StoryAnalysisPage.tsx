import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import type { Change } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { SelectedChangeCard } from '../components/SelectedChangeCard';
import { ModeOptions } from '../components/ModeOptions';
import { TagEditor } from '../components/TagEditor';
import { PageHeading, useDocumentTitle } from '../components/ui';
import form from '../components/form.module.css';
import ui from '../components/ui.module.css';
import styles from './StoryAnalysisPage.module.css';

export function StoryAnalysisPage() {
  useDocumentTitle('Story 만들기');
  const {
    activeProject: project,
    analysis,
    analysisSaved,
    analyze,
    clearAnalysis,
    selectedChangeIds,
    toggleChange,
    updateAnalysis, createStoryDraft, analyzing, analysisError, cancelAnalysis, activityStates, figma,
  } = useProjects();
  const navigate = useNavigate();
  useEffect(() => () => cancelAnalysis(), [cancelAnalysis]);
  const { reload: reloadFigma } = figma;
  useEffect(() => reloadFigma(), [reloadFigma]);
  useEffect(() => {
    if (!analysis || analysisSaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [analysis, analysisSaved]);
  const [creating, setCreating] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const selectionToggle = useRef<HTMLButtonElement>(null);
  const [createError, setCreateError] = useState('');
  const creatingRef = useRef(false);
  async function startWriting() {
    if (creatingRef.current || analyzing) return;
    creatingRef.current = true;
    setCreating(true);
    setCreateError('');
    try { navigate(`/stories/${await createStoryDraft()}/edit`, { replace: true }); }
    catch (error) {
      setCreateError(error instanceof Error ? error.message : '초안을 저장하지 못했어요.');
      creatingRef.current = false;
      setCreating(false);
    }
  }
  const changesHeading = useRef<HTMLHeadingElement>(null);
  if (!project) return <Navigate to="/projects" replace />;
  if (!analysis) return creating
    ? <div className={styles.page}><PageHeading title="Story 만들기" /><p role="status">저장한 초안을 열고 있어요…</p></div>
    : <Navigate to="/changes" replace />;

  const { changeIds } = analysis;
  const changes = changeIds
    .map((id) => project.changes.find((change) => change.id === id))
    .filter((change): change is Change => !!change);
  const missingChanges = changes.length !== changeIds.length;
  const loadingChanges = Object.values(activityStates).some(state => state.status === 'loading' || state.status === 'pending');

  // 남은 변경사항으로 분석을 다시 만들고, 마지막 하나까지 빼면 변경사항 선택 화면으로 돌아갑니다.
  // 뒤로 가기로 비워진 분석 화면에 돌아오지 않도록 기록을 교체합니다.
  async function removeChange(id: string) {
    if (analyzing || creatingRef.current) return;
    const rest = changeIds.filter((item) => item !== id);
    if (!rest.length) {
      if (selectedChangeIds.includes(id)) toggleChange(id);
      clearAnalysis();
      navigate('/changes', { replace: true });
      return;
    }
    await analyze(rest);
    if (selectionToggle.current?.getClientRects().length) selectionToggle.current.focus();
    else changesHeading.current?.focus();
  }

  return (
    <div className={styles.page}>
      <PageHeading title="Story 만들기" />
      <fieldset className={styles.layout} disabled={creating || analyzing}>
        <section
          className={`${styles.panel} ${styles.selection}`}
          aria-labelledby="selected-changes-heading"
        >
          <button type="button" ref={selectionToggle} className={styles.selectionToggle} aria-expanded={selectionOpen} aria-controls="analysis-selection-details" onClick={() => setSelectionOpen(open => !open)}>
            <span>선택한 변경사항 <strong>{changeIds.length}개</strong></span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <div id="analysis-selection-details" className={styles.selectionDetails} data-open={selectionOpen}>
          <div className={styles.selectionHeader}>
            <h2 id="selected-changes-heading" ref={changesHeading} tabIndex={-1}>
              선택된 변경사항
            </h2>
            <p className={styles.count}><strong>{changeIds.length}</strong>개</p>
            <Link to="/changes" onClick={clearAnalysis} className={styles.resetButton}>변경사항 재설정</Link>
          </div>
          <ul className={styles.changes}>
            {changes.map((change) => (
              <li key={change.id}>
                <SelectedChangeCard change={change} onRemove={() => removeChange(change.id)} />
              </li>
            ))}
          </ul>
          <div className={styles.mode}>
            <h3>분석 방식</h3>
            <ModeOptions value={analysis.mode} />
          </div>
          </div>
          {missingChanges && <p role={loadingChanges ? 'status' : 'alert'}>{loadingChanges
            ? '선택한 변경사항을 불러오고 있어요…'
            : '선택한 변경사항을 확인할 수 없어요. 수정한 분석은 유지돼요. 변경사항 목록에서 연결 상태와 수집 결과를 확인해주세요.'}</p>}
          {analyzing && <p role="status">남은 변경사항을 다시 분석하고 있어요…</p>}
          {analysisError && <p role="alert">{analysisError}</p>}
        </section>

        <div className={styles.result}>
          <section className={styles.panel} aria-labelledby="analysis-result-heading">
            <h2 id="analysis-result-heading">Story 분석 결과</h2>
            <p className={styles.description}>작업 기록과 확인 가능한 코드 변경을 정리한 초안이에요. 내용을 확인하고 수정해주세요.</p>
            <p className={styles.description} role={analysisSaved ? 'status' : 'alert'}>{analysisSaved
              ? '수정한 분석은 이 탭에 임시 저장돼요.'
              : '임시 저장을 사용할 수 없어요. 화면을 닫기 전에 ‘Story 작성 시작’을 눌러 저장해주세요.'}</p>
            <div className={styles.fields}>
              <div className={form.field}>
                <label htmlFor="analysis-title" className={form.label}>Story 제목</label>
                <textarea
                  id="analysis-title"
                  rows={1}
                  className={`${form.textarea} ${styles.titleInput}`}
                  placeholder="Story 제목을 입력해주세요."
                  maxLength={200}
                  autoComplete="off"
                  value={analysis.title}
                  onChange={(event) => updateAnalysis({ title: event.target.value })}
                />
              </div>
              <div className={form.field} role="group" aria-labelledby="analysis-tags-label">
                <span id="analysis-tags-label" className={form.label}>태그</span>
                <TagEditor tags={analysis.tags} onChange={(tags) => updateAnalysis({ tags })} />
              </div>
              <div className={form.field} role="group" aria-labelledby="analysis-before-after-label">
                <span id="analysis-before-after-label" className={form.label}>Before / After</span>
                <div className={styles.beforeAfter}>
                  <div className={styles.comparison}>
                    <label htmlFor="analysis-before" className={styles.before}>Before</label>
                    <textarea
                      id="analysis-before"
                      className={form.textarea}
                      rows={2}
                      maxLength={3000}
                      placeholder="변경 전 상황을 입력해주세요."
                      value={analysis.before}
                      onChange={(event) => updateAnalysis({ before: event.target.value })}
                    />
                  </div>
                  <div className={styles.comparison}>
                    <label htmlFor="analysis-after" className={styles.after}>After</label>
                    <textarea
                      id="analysis-after"
                      className={form.textarea}
                      rows={2}
                      maxLength={3000}
                      placeholder="변경 후 달라진 점을 입력해주세요."
                      value={analysis.after}
                      onChange={(event) => updateAnalysis({ after: event.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className={form.field}>
                <label htmlFor="analysis-summary" className={form.label}>변경사항 분석</label>
                <textarea
                  id="analysis-summary"
                  className={`${form.textarea} ${styles.summary}`}
                  rows={4}
                  maxLength={3000}
                  placeholder="변경사항을 요약해주세요."
                  value={analysis.summary}
                  onChange={(event) => updateAnalysis({ summary: event.target.value })}
                />
              </div>
            </div>
          </section>
          {createError && <p role="alert">{createError}</p>}

        </div>
          <button
            type="button"
            className={`${ui.primaryButton} ${styles.startButton}`}
            disabled={creating || analyzing || missingChanges}
            onClick={startWriting}
          >
            {creating ? '초안 저장 중…' : 'Story 작성 시작'}
          </button>
      </fieldset>
    </div>
  );
}

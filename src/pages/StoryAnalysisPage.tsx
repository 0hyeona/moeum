import { useRef } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import type { Change } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { ModeOptions } from '../components/ModeOptions';
import { SelectedChangeCard } from '../components/SelectedChangeCard';
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
    analyze,
    clearAnalysis,
    selectedChangeIds,
    toggleChange,
    updateAnalysis,
  } = useProjects();
  const navigate = useNavigate();
  const changesHeading = useRef<HTMLHeadingElement>(null);
  if (!project) return <Navigate to="/projects" replace />;
  if (!analysis) return <Navigate to="/changes" replace />;

  const { changeIds } = analysis;
  const changes = changeIds
    .map((id) => project.changes.find((change) => change.id === id))
    .filter((change): change is Change => !!change);

  // 남은 변경사항으로 분석을 다시 만들고, 마지막 하나까지 빼면 변경사항 선택 화면으로 돌아갑니다.
  // 뒤로 가기로 비워진 분석 화면에 돌아오지 않도록 기록을 교체합니다.
  function removeChange(id: string) {
    const rest = changeIds.filter((item) => item !== id);
    if (!rest.length) {
      if (selectedChangeIds.includes(id)) toggleChange(id);
      clearAnalysis();
      navigate('/changes', { replace: true });
      return;
    }
    analyze(rest);
    changesHeading.current?.focus();
  }

  return (
    <div className={styles.page}>
      <PageHeading title="Story 만들기" description="선택한 변경사항을 하나의 Story로 정리해보세요." />
      <div className={styles.layout}>
        <section
          className={`${styles.panel} ${styles.selection}`}
          aria-labelledby="selected-changes-heading"
        >
          <div className={styles.selectionHeader}>
            <h2 id="selected-changes-heading" ref={changesHeading} tabIndex={-1}>
              선택된 변경사항
            </h2>
            <p className={styles.count}><strong>{changes.length}</strong>개</p>
            <Link to="/changes" className={styles.resetButton}>변경사항 재설정</Link>
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
        </section>

        <div className={styles.result}>
          <section className={styles.panel} aria-labelledby="analysis-result-heading">
            <h2 id="analysis-result-heading">AI Story 분석 결과</h2>
            <p className={styles.description}>선택한 변경사항으로 만든 예시예요. 내용을 자유롭게 수정할 수 있어요.</p>
            <div className={styles.fields}>
              <div className={form.field} role="group" aria-labelledby="analysis-tags-label">
                <span id="analysis-tags-label" className={form.label}>태그</span>
                <TagEditor tags={analysis.tags} onChange={(tags) => updateAnalysis({ tags })} />
              </div>
              <div className={form.field}>
                <label htmlFor="analysis-title" className={form.label}>제목 텍스트</label>
                <input
                  id="analysis-title"
                  className={form.input}
                  placeholder="Story 제목을 입력해주세요."
                  maxLength={100}
                  autoComplete="off"
                  value={analysis.title}
                  onChange={(event) => updateAnalysis({ title: event.target.value })}
                />
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
                      placeholder="변경 후 달라진 점을 입력해주세요."
                      value={analysis.after}
                      onChange={(event) => updateAnalysis({ after: event.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className={form.field}>
                <label htmlFor="analysis-summary" className={form.label}>AI 분석</label>
                <textarea
                  id="analysis-summary"
                  className={`${form.textarea} ${styles.summary}`}
                  rows={4}
                  placeholder="변경사항을 요약해주세요."
                  value={analysis.summary}
                  onChange={(event) => updateAnalysis({ summary: event.target.value })}
                />
              </div>
            </div>
          </section>
          <button
            type="button"
            className={`${ui.primaryButton} ${styles.startButton}`}
            onClick={() => navigate('/stories/new')}
          >
            Story 작성 시작
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import type { Service, Story, StoryStatus } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { type FilterOption } from '../components/FilterSelect';
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter';
import { MoodFilter } from '../components/MoodFilter';
import { StoryCard } from '../components/StoryCard';
import { SearchField } from '../components/SearchField';
import { PageHeading, useDocumentTitle } from '../components/ui';
import styles from './TimelinePage.module.css';

const statusOptions: readonly FilterOption<'all' | StoryStatus>[] = [
  { value: 'all', label: '전체 상태' }, { value: '초안', label: '초안' }, { value: '진행중', label: '진행 중' }, { value: '완료', label: '완료' },
];
const sourceOptions: readonly FilterOption<'all' | Service>[] = [
  { value: 'all', label: '전체 출처' }, { value: 'Notion', label: 'Notion' },
  { value: 'GitHub', label: 'GitHub' }, { value: 'Figma', label: 'Figma' },
];
export function TimelinePage() {
  useDocumentTitle('타임라인');
  const { activeProject: project } = useProjects();
  const [period, setPeriod] = useState<DateRange | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | StoryStatus>('all');
  const [source, setSource] = useState<'all' | Service>('all');
  if (!project) return <Navigate to="/projects" replace />;
  const keyword = query.trim().toLowerCase();
  const filtered = project.stories.filter(story =>
    (!period || (story.date >= period.start && story.date <= period.end)) &&
    (status === 'all' || story.status === status) && (source === 'all' || story.sources.includes(source)) &&
    (!keyword || [story.title, story.summary, story.why, ...story.tags].some(text => text.toLowerCase().includes(keyword))));
  const sortedStories = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const hasFilters = !!query || status !== 'all' || source !== 'all' || !!period;

  const months = new Map<string, Map<string, Story[]>>();
  for (const story of sortedStories) {
    const month = story.date.slice(0, 7);
    if (!months.has(month)) months.set(month, new Map());
    const days = months.get(month)!;
    days.set(story.date, [...(days.get(story.date) ?? []), story]);
  }
  const tagCounts = new Map<string, number>();
  for (const story of project.stories) for (const tag of story.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const tags = [...tagCounts].sort((a,b) => b[1]-a[1]).slice(0,6);
  const stats = [{ label: '전체', count: project.stories.length }, ...(['완료', '진행중', '초안'] as const).map(value => ({ label: value === '진행중' ? '진행 중' : value, count: project.stories.filter(story => story.status === value).length }))];
  function resetFilters() { setQuery(''); setStatus('all'); setSource('all'); setPeriod(null); }
  return <>
    <PageHeading title="타임라인" />
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <SearchField className={styles.search} label="Story 검색" placeholder="Story 제목, Summary, Why 또는 태그 검색" value={query} onChange={setQuery} />
        <div className={styles.filters}>
          <MoodFilter label="상태" value={status} options={statusOptions} onChange={setStatus} />
          <MoodFilter label="출처" value={source} options={sourceOptions} onChange={setSource} />
          <DateRangeFilter value={period} onChange={setPeriod} />
          {hasFilters && <button type="button" className={styles.textButton} onClick={resetFilters}>초기화</button>}
        </div>
      </div>
      <section className={styles.timeline} aria-label="날짜별 Story">
        <p className={styles.srOnly} role="status">Story {sortedStories.length}개</p>
        {[...months].map(([month, days]) => <section className={styles.month} key={month} aria-label={month}>
          <h2 className={styles.monthHeading}>{Number(month.slice(0,4))}년 {Number(month.slice(5,7))}월</h2>
          {[...days].map(([date, stories]) => <div className={styles.day} key={date}>
            <h3 className={styles.dayHeading}><time dateTime={date.replaceAll('.', '-')}>{Number(date.slice(5,7))}월 {Number(date.slice(8,10))}일</time><span>({stories.length})</span></h3>
            <ul className={styles.cards}>{stories.map(story => <li key={story.id}><StoryCard story={story} /></li>)}</ul>
          </div>)}
        </section>)}
        {!sortedStories.length && <div className={styles.empty}><p>{hasFilters ? '조건에 맞는 Story가 없어요.' : '아직 작성한 Story가 없어요.'}</p>{hasFilters ? <button type="button" className={styles.textButton} onClick={resetFilters}>검색 조건 초기화</button> : <Link className={styles.textButton} to="/changes">변경사항에서 Story 만들기</Link>}</div>}
      </section>
      <aside className={styles.aside} aria-label="프로젝트 Story 요약">
        <section className={styles.panel}><h2>활동 통계</h2><ul className={styles.stats}>{stats.map(stat => <li key={stat.label}>{stat.label} <strong>{stat.count}</strong>개</li>)}</ul></section>
        <section className={styles.panel}><h2>자주 쓴 태그</h2>{tags.length ? <ul className={styles.tags}>{tags.map(([tag]) => <li key={tag}><button type="button" onClick={() => setQuery(tag)} aria-label={tag + ' 태그로 검색'}>{tag}</button></li>)}</ul> : <p className={styles.noTags}>아직 태그가 없어요.</p>}</section>
      </aside>
    </div>
  </>;
}

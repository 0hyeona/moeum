import { StoryLoadNotice } from '../components/StoryLoadNotice';
import { Link, Navigate, useSearchParams } from 'react-router';
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
  { value: 'all', label: '전체 상태' }, { value: '초안', label: '초안' }, { value: '완료', label: '완료' },
];
const sourceOptions: readonly FilterOption<'all' | Service>[] = [
  { value: 'all', label: '전체 출처' }, { value: 'Notion', label: 'Notion' },
  { value: 'GitHub', label: 'GitHub' }, { value: 'Figma', label: 'Figma' },
];

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}\.\d{2}\.\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('.').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function TimelinePage() {
  useDocumentTitle('타임라인');
  const { activeProject: project, storyListState } = useProjects();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const status = statusOptions.find(option => option.value === searchParams.get('status'))?.value ?? 'all';
  const source = sourceOptions.find(option => option.value === searchParams.get('source'))?.value ?? 'all';
  const start = searchParams.get('start'), end = searchParams.get('end');
  const period: DateRange | null = validDate(start) && validDate(end) && start <= end ? { start, end } : null;
  function setFilter(name: string, value: string, replace = false) {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value);
      else next.delete(name);
      return next;
    }, { replace });
  }
  const setQuery = (value: string) => setFilter('q', value, true);
  const setStatus = (value: 'all' | StoryStatus) => setFilter('status', value === 'all' ? '' : value);
  const setSource = (value: 'all' | Service) => setFilter('source', value === 'all' ? '' : value);
  function setPeriod(value: DateRange | null) {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (value) { next.set('start', value.start); next.set('end', value.end); }
      else { next.delete('start'); next.delete('end'); }
      return next;
    });
  }
  const keyword = query.trim().toLowerCase();
  const filtered = (project?.stories ?? []).filter(story =>
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
  for (const story of sortedStories) for (const tag of new Set(story.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const tags = [...tagCounts].sort((a,b) => b[1]-a[1]).slice(0,6);
  const stats = [{ label: '전체', count: sortedStories.length }, ...(['완료', '초안'] as const).map(value => ({ label: value, count: sortedStories.filter(story => story.status === value).length }))];
  if (!project) return <Navigate to="/projects" replace />;
  function resetFilters() {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      for (const name of ['q', 'status', 'source', 'start', 'end']) next.delete(name);
      return next;
    });
  }
  return <>
    <PageHeading title="타임라인" />
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <SearchField className={styles.search} label="Story 검색" placeholder="Story 또는 태그 검색" value={query} onChange={setQuery} />
        <div className={styles.filters}>
          <MoodFilter label="상태" value={status} options={statusOptions} onChange={setStatus} mobileDefaultLabel="상태" />
          <MoodFilter label="출처" value={source} options={sourceOptions} onChange={setSource} mobileDefaultLabel="출처" />
          <DateRangeFilter value={period} onChange={setPeriod} mobileLabel="기간" />

        </div>
        {hasFilters && <div className={styles.selectedFilters} aria-label="선택한 검색 조건">
          {query && <button type="button" className={styles.conditionChip} onClick={() => setQuery('')} aria-label="검색어 해제"><span>{query}</span><span aria-hidden="true">×</span></button>}
          {status !== 'all' && <button type="button" className={styles.conditionChip} onClick={() => setStatus('all')} aria-label={status + ' 상태 해제'}><span>{status}</span><span aria-hidden="true">×</span></button>}
          {source !== 'all' && <button type="button" className={styles.conditionChip} onClick={() => setSource('all')} aria-label={source + ' 출처 해제'}><span>{source}</span><span aria-hidden="true">×</span></button>}
          {period && <button type="button" className={styles.conditionChip} onClick={() => setPeriod(null)} aria-label="기간 조건 해제"><span>{period.start} ~ {period.end}</span><span aria-hidden="true">×</span></button>}
          <button type="button" className={styles.resetFilters} onClick={resetFilters}>초기화</button>
        </div>}
      </div>
      <section className={styles.timeline} aria-label="날짜별 Story">
        <StoryLoadNotice />
        <p className={styles.resultsCount} role="status">{storyListState.status === 'ready' ? <>검색 결과 <strong>{sortedStories.length}개</strong></> : 'Story 목록을 확인하고 있어요.'}</p>
        {[...months].map(([month, days]) => <section className={styles.month} key={month} aria-label={month}>
          <h2 className={styles.monthHeading}>{Number(month.slice(0,4))}년 {Number(month.slice(5,7))}월</h2>
          {[...days].map(([date, stories]) => <div className={styles.day} key={date}>
            <h3 className={styles.dayHeading}><time dateTime={date.replaceAll('.', '-')}>{Number(date.slice(5,7))}월 {Number(date.slice(8,10))}일</time><span>({stories.length})</span></h3>
            <ul className={styles.cards}>{stories.map(story => <li key={story.id}><StoryCard story={story} /></li>)}</ul>
          </div>)}
        </section>)}
        {storyListState.status === 'ready' && !sortedStories.length && <div className={styles.empty}><p>{hasFilters ? '조건에 맞는 Story가 없어요.' : '아직 작성한 Story가 없어요.'}</p>{hasFilters ? <button type="button" className={styles.textButton} onClick={resetFilters}>검색 조건 초기화</button> : <Link className={styles.textButton} to="/changes">변경사항에서 Story 만들기</Link>}</div>}
      </section>
      <aside className={styles.aside} aria-label="Story 통계와 태그">

        <section className={`${styles.panel} ${styles.statsPanel}`}><h2>활동 통계</h2><ul className={styles.stats}>{stats.map(stat => <li key={stat.label}><span className={styles.statLabel}>{stat.label}</span><span className={styles.statValue}><strong>{stat.count}</strong>개</span></li>)}</ul></section>
        <section className={styles.panel}><h2>자주 쓴 태그</h2>{tags.length ? <ul className={styles.tags}>{tags.map(([tag]) => <li key={tag}><button type="button" onClick={() => setQuery(tag)} aria-label={tag + ' 태그로 검색'}>{tag}</button></li>)}</ul> : <p className={styles.noTags}>아직 태그가 없어요.</p>}</section>
      </aside>
    </div>
  </>;
}

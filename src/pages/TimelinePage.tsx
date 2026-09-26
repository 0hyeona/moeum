import { useRef, useState, useSyncExternalStore } from 'react';
import { Link, Navigate } from 'react-router';
import type { Service, Story, StoryStatus } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { FilterSelect, type FilterOption } from '../components/FilterSelect';
import { SearchField } from '../components/SearchField';
import { StoryCard } from '../components/StoryCard';
import { PageHeading, useDocumentTitle } from '../components/ui';
import ui from '../components/ui.module.css';
import styles from './TimelinePage.module.css';

type StatusFilter = 'all' | StoryStatus;
type SourceFilter = 'all' | Service;
type PeriodFilter = 'all' | '7' | '30' | '90';

// 드롭다운 버튼에 필터 이름이 보이도록 '전체' 항목은 필터 이름으로 표시합니다.
const statusOptions: readonly FilterOption<StatusFilter>[] = [
  { value: 'all', label: '상태' },
  { value: '완료', label: '완료' },
  { value: '초안', label: '초안' },
];
const sourceOptions: readonly FilterOption<SourceFilter>[] = [
  { value: 'all', label: '출처' },
  { value: 'GitHub', label: 'GitHub' },
  { value: 'Figma', label: 'Figma' },
  { value: 'Notion', label: 'Notion' },
];
const periodOptions: readonly FilterOption<PeriodFilter>[] = [
  { value: 'all', label: '전체 기간' },
  { value: '7', label: '최근 7일' },
  { value: '30', label: '최근 30일' },
  { value: '90', label: '최근 90일' },
];

const dayInMs = 24 * 60 * 60 * 1000;

const searchPlaceholder = 'Story 제목, Summary, Why 또는 태그를 검색해주세요.';
// 좁은 화면에서는 긴 안내 문구가 잘리므로 검색 대상만 짧게 보여줍니다.
const compactSearchPlaceholder = '제목, Summary, Why, 태그 검색';
const compactQuery = '(max-width: 480px)';

function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function isCompactScreen() {
  return window.matchMedia(compactQuery).matches;
}

type DayGroup = { date: string; stories: Story[] };
type MonthGroup = { month: string; days: DayGroup[] };

function parseDate(date: string) {
  const [year, month, day] = date.split('.').map(Number);
  return { year, month, day };
}

// 오늘을 0일로 셉니다. '최근 7일'은 오늘부터 6일 전까지입니다.
function daysSince(date: string, today: Date) {
  const { year, month, day } = parseDate(date);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((start.getTime() - new Date(year, month - 1, day).getTime()) / dayInMs);
}

// Story를 최신순으로 정렬해 월 → 날짜 순으로 묶습니다. 같은 날짜는 원래 순서를 유지합니다.
function groupStories(stories: Story[]) {
  const months: MonthGroup[] = [];
  for (const story of [...stories].sort((a, b) => b.date.localeCompare(a.date))) {
    const month = story.date.slice(0, 7);
    let monthGroup = months.at(-1);
    if (monthGroup?.month !== month) {
      monthGroup = { month, days: [] };
      months.push(monthGroup);
    }
    let dayGroup = monthGroup.days.at(-1);
    if (dayGroup?.date !== story.date) {
      dayGroup = { date: story.date, stories: [] };
      monthGroup.days.push(dayGroup);
    }
    dayGroup.stories.push(story);
  }
  return months;
}

// 자주 쓴 순서, 같으면 최근 Story에 먼저 나온 순서입니다.
function topTags(stories: Story[], limit: number) {
  const counts = new Map<string, number>();
  for (const story of stories) {
    for (const tag of story.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([tag]) => tag);
}

export function TimelinePage() {
  useDocumentTitle('타임라인');
  const { activeProject: project } = useProjects();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const compact = useSyncExternalStore(subscribeCompact, isCompactScreen);
  if (!project) return <Navigate to="/projects" replace />;

  const { stories } = project;
  const keyword = query.trim().toLowerCase();
  const today = new Date();
  const visible = stories.filter((story) =>
    (status === 'all' || story.status === status)
    && (source === 'all' || story.sources.includes(source))
    && (period === 'all' || daysSince(story.date, today) < Number(period))
    && (!keyword || [story.title, story.summary, story.why, ...story.tags].some((text) => text.toLowerCase().includes(keyword))),
  );
  const months = groupStories(visible);
  const tags = topTags(stories, 6);
  const stats = [
    { label: '전체', count: stories.length },
    { label: '완료', count: stories.filter((story) => story.status === '완료').length },
    { label: '초안', count: stories.filter((story) => story.status === '초안').length },
  ];

  function resetFilters() {
    setQuery('');
    setStatus('all');
    setSource('all');
    setPeriod('all');
    // 초기화 버튼이 사라지므로 포커스를 검색창으로 옮깁니다.
    toolbarRef.current?.querySelector('input')?.focus();
  }

  return (
    <>
      <PageHeading title="타임라인" />
      <div className={styles.page}>
        <div ref={toolbarRef} className={styles.toolbar}>
          <SearchField
            className={styles.search}
            label="Story 검색"
            placeholder={compact ? compactSearchPlaceholder : searchPlaceholder}
            value={query}
            onChange={setQuery}
          />
          <div className={styles.filters}>
            <FilterSelect className={styles.filter} label="상태 필터" value={status} options={statusOptions} onChange={setStatus} />
            <FilterSelect className={styles.filter} label="출처 필터" value={source} options={sourceOptions} onChange={setSource} />
            <FilterSelect className={styles.filter} label="기간 필터" value={period} options={periodOptions} onChange={setPeriod} />
          </div>
        </div>

        <aside className={styles.aside} aria-label="Story 요약">
          <section className={styles.panel} aria-labelledby="stats-heading">
            <h2 id="stats-heading">활동 통계</h2>
            <ul className={styles.stats}>
              {stats.map((stat) => <li key={stat.label}>{stat.label} <strong>{stat.count}</strong>개</li>)}
            </ul>
          </section>
          <section className={styles.panel} aria-labelledby="tags-heading">
            <h2 id="tags-heading">자주 쓴 태그</h2>
            {tags.length > 0 ? (
              <ul className={styles.tags}>
                {tags.map((tag) => (
                  <li key={tag}>
                    <button type="button" className={styles.tag} aria-label={`${tag} 태그로 검색`} onClick={() => setQuery(tag)}>{tag}</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.noTags}>아직 태그가 없어요.</p>
            )}
          </section>
        </aside>

        <section className={styles.timeline} aria-label="Story 타임라인">
          <p className={ui.visuallyHidden} role="status">{stories.length > 0 ? `Story ${visible.length}개` : ''}</p>
          {stories.length === 0 ? (
            <div className={styles.empty}>
              <p>아직 작성된 Story가 없어요.</p>
              <Link to="/changes">변경사항에서 Story 만들기</Link>
            </div>
          ) : months.length === 0 ? (
            <div className={styles.empty}>
              <p>조건에 맞는 Story가 없어요.</p>
              <button type="button" onClick={resetFilters}>검색 조건 초기화</button>
            </div>
          ) : (
            months.map(({ month, days }) => <MonthSection key={month} month={month} days={days} />)
          )}
        </section>
      </div>
    </>
  );
}

function MonthSection({ month, days }: MonthGroup) {
  const { year, month: monthNumber } = parseDate(month);
  const headingId = `timeline-${month.replace('.', '-')}`;

  return (
    <section className={styles.month} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.monthHeading}>{year}년 {monthNumber}월</h2>
      {days.map(({ date, stories }) => {
        const { day } = parseDate(date);
        return (
          <div key={date} className={styles.day}>
            <h3 className={styles.dayHeading}>
              <time dateTime={date.replaceAll('.', '-')}>{monthNumber}월 {day}일</time>
              <span className={styles.count} aria-hidden="true">({stories.length})</span>
              <span className={ui.visuallyHidden}>Story {stories.length}개</span>
            </h3>
            <ul className={styles.cards}>
              {stories.map((story) => <li key={story.id}><StoryCard story={story} /></li>)}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

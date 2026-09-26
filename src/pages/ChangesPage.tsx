import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import closeIcon from '../../assets/icons/close.svg';
import { services, type Change, type Service } from '../data/projects';
import { useProjects } from '../state/ProjectsContext';
import { FilterSelect, type FilterOption } from '../components/FilterSelect';
import { ModeOptions } from '../components/ModeOptions';
import { SearchField } from '../components/SearchField';
import { SelectedChangeCard } from '../components/SelectedChangeCard';
import { Badge, PageHeading, ServiceIcon, useDocumentTitle } from '../components/ui';
import form from '../components/form.module.css';
import ui from '../components/ui.module.css';
import styles from './ChangesPage.module.css';

type Period = 'today' | 'week' | 'all';
const periodOptions: readonly FilterOption<Period>[] = [
  { value: 'today', label: '오늘' },
  { value: 'week', label: '최근 7일' },
  { value: 'all', label: '전체 기간' },
];
const periodDays: Record<Period, number> = { today: 0, week: 6, all: Infinity };

const serviceOptions: readonly FilterOption<Service | 'all'>[] = [
  { value: 'all', label: '서비스 전체' },
  ...services.map((service) => ({ value: service, label: service })),
];

function isService(value: string | null): value is Service {
  return services.some((service) => service === value);
}

function isPeriod(value: string | null): value is Period {
  return periodOptions.some((option) => option.value === value);
}

// 대시보드의 '전체 보기' 링크(?service=, ?period=all)로 들어오면 오늘 것만 보여주지 않습니다.
function initialPeriod(searchParams: URLSearchParams): Period {
  const period = searchParams.get('period');
  if (isPeriod(period)) return period;
  return searchParams.has('service') ? 'all' : 'today';
}

function checkboxId(change: Change) {
  return `change-${change.id}-check`;
}

function matchesQuery(change: Change, query: string) {
  if (!query) return true;
  return [change.title, change.description, change.service, change.status, change.meta, change.reference]
    .some((text) => text.toLowerCase().includes(query));
}

export function ChangesPage() {
  useDocumentTitle('변경사항 선택');
  const { activeProject: project, selectedChangeIds, toggleChange, mode, setMode, analyze } = useProjects();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>(() => initialPeriod(searchParams));
  const [status, setStatus] = useState('all');
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const emptyMessage = useRef<HTMLParagraphElement>(null);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const selectedList = useRef<HTMLUListElement>(null);
  // 누른 버튼이 사라지는 동작(숨기기, 다시 보기, 선택 해제, 필터 초기화) 뒤에 포커스를 옮길 곳을 렌더링 후에 찾습니다.
  const pendingFocus = useRef<(() => HTMLElement | null | undefined) | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const target = pendingFocus.current();
    pendingFocus.current = null;
    target?.focus();
  });
  if (!project) return <Navigate to="/projects" replace />;

  const serviceParam = searchParams.get('service');
  const service = isService(serviceParam) ? serviceParam : 'all';
  const statusOptions: FilterOption<string>[] = [
    { value: 'all', label: '상태 전체' },
    ...[...new Set(project.changes.map((change) => change.status))].map((value) => ({ value, label: value })),
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const hiddenChanges = project.changes.filter((change) => hiddenIds.includes(change.id));
  const matchesFilters = (change: Change) => (
    change.daysAgo <= periodDays[period]
    && (service === 'all' || change.service === service)
    && (status === 'all' || change.status === status)
    && matchesQuery(change, normalizedQuery)
  );
  const shownChanges = project.changes.filter((change) => !hiddenIds.includes(change.id));
  const visibleChanges = shownChanges.filter(matchesFilters);
  const filteredOutCount = shownChanges.length - visibleChanges.length;
  // 오른쪽 패널은 고른 순서대로 보여줍니다.
  const selectedChanges = selectedChangeIds
    .map((id) => project.changes.find((change) => change.id === id))
    .filter((change): change is Change => !!change);

  function changeService(value: Service | 'all') {
    setSearchParams(value === 'all' ? {} : { service: value }, { replace: true });
  }

  function focusCheckbox(change: Change | undefined) {
    return change ? document.getElementById(checkboxId(change)) : null;
  }

  function hideChange(change: Change) {
    const index = visibleChanges.indexOf(change);
    const next = visibleChanges[index + 1] ?? visibleChanges[index - 1];
    pendingFocus.current = () => focusCheckbox(next) ?? restoreButton.current;
    setHiddenIds((current) => [...current, change.id]);
    if (selectedChangeIds.includes(change.id)) toggleChange(change.id);
  }

  function restoreHidden() {
    const restored = hiddenChanges.find(matchesFilters);
    pendingFocus.current = () => focusCheckbox(restored ?? visibleChanges[0]) ?? emptyMessage.current;
    setHiddenIds([]);
  }

  function resetFilters() {
    setQuery('');
    setPeriod('all');
    setStatus('all');
    changeService('all');
    pendingFocus.current = () => focusCheckbox(shownChanges[0]);
  }

  function removeSelected(change: Change, index: number) {
    // 다음 카드의 선택 해제 버튼으로, 마지막이면 이전 카드, 모두 비면 패널 제목으로 옮깁니다.
    pendingFocus.current = () => {
      const buttons = selectedList.current?.querySelectorAll('button');
      return buttons?.[Math.min(index, buttons.length - 1)] ?? selectedHeading.current;
    };
    toggleChange(change.id);
  }

  function startAnalysis() {
    const result = analyze();
    if (result) navigate('/stories/analysis');
  }

  return (
    <div className={styles.page}>
      <PageHeading title="변경사항 선택" />
      <div className={styles.layout}>
        <section className={styles.changes} aria-label="변경사항 목록">
          <div className={styles.toolbar}>
            <SearchField className={styles.search} label="변경사항 검색" placeholder="변경 메시지, 서비스, 상태 검색" value={query} onChange={setQuery} />
            <div className={styles.filters}>
              <FilterSelect label="기간" value={period} options={periodOptions} onChange={setPeriod} />
              <FilterSelect label="서비스" value={service} options={serviceOptions} onChange={changeService} />
              <FilterSelect label="상태" value={status} options={statusOptions} onChange={setStatus} />
            </div>
          </div>

          {hiddenChanges.length > 0 && (
            <button ref={restoreButton} type="button" className={styles.restore} onClick={restoreHidden}>
              숨긴 변경사항 {hiddenChanges.length}개 다시 보기
            </button>
          )}

          {project.changes.length === 0 ? (
            <div className={styles.empty}>
              <p>아직 수집된 변경사항이 없어요.</p>
              <Link to="/stories/new" className={styles.textButton}>Story 직접 작성하기</Link>
            </div>
          ) : visibleChanges.length === 0 ? (
            <div className={styles.empty}>
              <p ref={emptyMessage} tabIndex={-1}>조건에 맞는 변경사항이 없어요.</p>
              {filteredOutCount > 0 && (
                <>
                  <p className={styles.emptyHint}>필터나 검색어에 가려진 변경사항이 {filteredOutCount}개 있어요.</p>
                  <button type="button" className={styles.textButton} onClick={resetFilters}>필터 초기화</button>
                </>
              )}
            </div>
          ) : (
            <ul className={styles.feed}>
              {visibleChanges.map((change) => (
                <li key={change.id}>
                  <FeedCard
                    change={change}
                    selected={selectedChangeIds.includes(change.id)}
                    onToggle={() => toggleChange(change.id)}
                    onHide={() => hideChange(change)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={styles.side}>
          <section className={`${styles.panel} ${styles.selectedPanel}`} aria-labelledby="selected-heading">
            <h2 id="selected-heading" ref={selectedHeading} tabIndex={-1}>선택된 변경사항</h2>
            {selectedChanges.length > 0 ? (
              <ul ref={selectedList} className={styles.selectedList}>
                {selectedChanges.map((change, index) => (
                  <li key={change.id} className={styles.selectedItem}>
                    <SelectedChangeCard change={change} onRemove={() => removeSelected(change, index)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>왼쪽에서 Story로 정리할 변경사항을 선택해주세요.</p>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="mode-heading">
            <h2 id="mode-heading">분석 방식</h2>
            <div className={styles.modes}>
              <ModeOptions value={mode} onChange={setMode} />
            </div>
          </section>

          <button type="button" className={`${ui.primaryButton} ${styles.analyzeButton}`} disabled={selectedChanges.length === 0} onClick={startAnalysis}>
            AI Story 분석
          </button>
        </div>
      </div>
    </div>
  );
}

type FeedCardProps = {
  change: Change;
  selected: boolean;
  onToggle: () => void;
  onHide: () => void;
};

// 카드 전체가 체크박스의 label이라 어디를 눌러도 선택됩니다. 숨기기 버튼은 label 밖에 겹쳐 둡니다.
function FeedCard({ change, selected, onToggle, onHide }: FeedCardProps) {
  const titleId = `change-${change.id}-title`;
  const metaId = `change-${change.id}-meta`;
  return (
    <div className={styles.card}>
      <label className={styles.cardBody}>
        <span className={styles.cardHeader}>
          <ServiceIcon service={change.service} />
          <span className={styles.source}>
            <span className={styles.service}>{change.service}</span>
            <span id={metaId} className={styles.meta}>{change.meta}</span>
          </span>
          <input
            id={checkboxId(change)}
            type="checkbox"
            className={`${form.radio} ${styles.check}`}
            checked={selected}
            onChange={onToggle}
            aria-labelledby={titleId}
            aria-describedby={metaId}
          />
        </span>
        <span id={titleId} className={styles.title}>{change.title}</span>
        <span className={styles.description}>{change.description}</span>
        <span className={styles.status}><Badge>{change.status}</Badge></span>
      </label>
      <button type="button" className={styles.hide} onClick={onHide} aria-label={`${change.title} 목록에서 숨기기`}>
        <img src={closeIcon} alt="" width="24" height="24" />
      </button>
    </div>
  );
}

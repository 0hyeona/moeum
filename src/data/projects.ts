export type Service = 'GitHub' | 'Figma' | 'Notion';
export const services: readonly Service[] = ['GitHub', 'Figma', 'Notion'];

export type ProjectStatus = '진행 중' | '완료' | '사용자';

export type ServiceState =
  | { status: 'connected' }
  | { status: 'reconnect' }
  | { status: 'disconnected' };

export type AnalysisMode = '의미 중심' | '균형' | '코드 상세';
export const analysisModes: readonly AnalysisMode[] = ['의미 중심', '균형', '코드 상세'];

// 아직 Story로 정리하지 않은 변경사항(s5 피드 카드, s5·s6 선택 항목 카드)
export type Change = {
  id: string;
  service: Service;
  reference: string; // 선택 항목 카드 제목에 서비스명 뒤로 붙는 식별자: "GitHub PR #184"
  title: string;
  description: string;
  meta: string; // 피드 카드 서비스명 아래 줄: "PR #184 · 2분 전"
  status: string; // 피드 카드 배지, 상태 필터 값
  labels: string[]; // 선택 항목 카드 배지
  daysAgo: number; // 기간 필터 기준(0 = 오늘)
  before: string; // 예시 분석 결과를 만들 때 쓰는 변경 전/후 문장
  after: string;
};

export type StoryStatus = '초안' | '완료';

export type StoryFields = {
  title: string;
  why: string;
  problem: string;
  solution: string;
  result: string;
  learned: string;
  next: string;
  memo: string;
  summary: string; // AI 요약
  before: string;
  after: string;
  tags: string[];
};

export type Story = StoryFields & {
  id: string;
  status: StoryStatus;
  sources: Service[]; // 출처(타임라인 필터)
  date: string; // YYYY.MM.DD
};

export type Commit = {
  sha: string;
  message: string;
  date: string;
  additions: number;
  deletions: number;
  state: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  updatedAt: string;
  services: Record<Service, ServiceState>;
  repositories: string[];
  selectedRepository: string | null;
  changes: Change[];
  stories: Story[]; // 최신순
  commits: Commit[];
};

// s6 AI Story 분석 결과. 실제 AI 대신 선택한 변경사항으로 예시 결과를 만듭니다.
export type Analysis = {
  changeIds: string[];
  mode: AnalysisMode;
  tags: string[];
  title: string;
  before: string;
  after: string;
  summary: string;
};

export const emptyStoryFields: StoryFields = { title: '', why: '', problem: '', solution: '', result: '', learned: '', next: '', memo: '', summary: '', before: '', after: '', tags: [] };

function story(id: string, status: StoryStatus, date: string, sources: Service[], fields: Partial<StoryFields> & Pick<StoryFields, 'title' | 'summary' | 'tags'>): Story {
  return { ...emptyStoryFields, ...fields, id, status, date, sources };
}

const loginStory = story('login-ui', '완료', '2026.09.01', ['GitHub', 'Figma'], {
  title: '사용자가 오류 상황에서도 다음 행동을 바로 이해할 수 있도록 개선했습니다.',
  why: '로그인 과정은 사용자가 서비스를 처음 경험하는 지점이기 때문에\n오류 상황에서도 사용자가 현재 상태와 다음 행동을 이해할 수 있어야 한다고 판단했습니다.',
  problem: '인증 토큰이 만료된 상태에서 API 요청이 실패하면\n화면 전환이 이루어지지 않아 빈 화면이 표시되는 문제가 있었습니다.',
  solution: '인증 만료 응답을 공통으로 감지하고\n기존 세션을 제거한 뒤 로그인 페이지로 이동하도록 수정했습니다.\n로그인 화면의 UI도 함께 개선해\n재로그인 상황에서 혼란이 없도록 흐름을 정리했습니다.',
  result: '인증 토큰 만료 시 더 이상 빈 화면이 노출되지 않고\n사용자가 다시 로그인해야 하는 상황을 명확하게 인지할 수 있게 되었습니다.',
  learned: '정상 플로우뿐 아니라\n오류와 예외 상황 역시 사용자 경험의 일부라는 점을 배웠습니다.',
  next: '인증 오류 유형별로 안내 문구를 나누어 정리합니다.',
  memo: '재로그인 안내 문구는 디자인 팀과 함께 한 번 더 다듬기로 했습니다.',
  summary: '로그인 화면의 입력 UI를 개선하고\n인증 토큰이 만료됐을 때 빈 화면이 표시되던 문제를 수정했습니다.\n디자인과 구현 변경을 함께 정리하여\n로그인 경험의 안정성과 흐름을 개선했습니다.',
  before: '토큰이 만료될 경우\n로그인 화면으로 이동하지 않고 빈 화면이 노출됨',
  after: '토큰 만료를 감지하면\n세션을 종료하고 로그인 화면으로 이동',
  tags: ['로그인', '인증', 'AI 생성'],
});

// 백엔드 연결 전까지 화면을 채우는 예시 데이터입니다. 새로고침하면 초기 상태로 돌아갑니다.
export const sampleProjects: Project[] = [
  {
    id: 'moeum',
    name: '모음',
    description: '프로젝트 변경사항을 수집하고 작업의 이유와 과정을 Story로 기록하는 프로젝트',
    status: '진행 중',
    updatedAt: '3일전',
    services: {
      GitHub: { status: 'connected' },
      Figma: { status: 'connected' },
      Notion: { status: 'reconnect' },
    },
    repositories: ['moeum-web', 'moeum-api', 'moeum-ai', 'moeum-design-system', 'moeum-docs', 'moeum-infra', 'moeum-landing', 'moeum-prototype'],
    selectedRepository: null,
    changes: [
      { id: 'figma-login-layout', service: 'Figma', reference: '로그인 화면', title: '로그인 화면 레이아웃 리뉴얼', description: '로그인 화면의 레이아웃, 패딩, 타이포 규칙을 정리한 파일입니다. 버전 히스토리와 변경 범위가 함께 연결되어 있습니다.', meta: '파일 업데이트 · 28분 전', status: '업데이트', labels: ['디자인', '레이아웃', '로그인'], daysAgo: 0, before: '로그인 화면의 여백과 글자 크기가 화면마다 달랐음', after: '로그인 화면의 레이아웃과 타이포 규칙을 하나로 정리함' },
      { id: 'github-login-form', service: 'GitHub', reference: 'PR #184', title: '로그인 폼 UI 커밋', description: '입력 필드, 버튼, 오류 상태를 한 번에 정리한 커밋입니다. PR 리뷰어 2명이 할당되어 있습니다.', meta: 'PR #184 · 2분 전', status: '머지', labels: ['UI', '로그인', '머지'], daysAgo: 0, before: '입력 필드와 버튼의 오류 상태가 따로 관리됨', after: '입력 필드, 버튼, 오류 상태를 하나의 폼 컴포넌트로 정리함' },
      { id: 'notion-design-docs', service: 'Notion', reference: '디자인 시스템', title: '디자인 시스템 문서 업데이트', description: '컴포넌트 정의, 상태 예시, 사용 가이드를 최신 버전으로 정리했습니다. 4개 페이지가 함께 변경되었습니다.', meta: '페이지 업데이트 · 14분 전', status: '업데이트', labels: ['문서', '디자인', '가이드'], daysAgo: 0, before: '컴포넌트 문서가 이전 버전에 머물러 있었음', after: '컴포넌트 정의와 사용 가이드를 최신 버전으로 맞춤' },
      { id: 'github-token-fix', service: 'GitHub', reference: 'a3f21bc', title: 'fix: 인증 토큰 만료 시 빈 화면 노출 수정', description: '인증 만료 응답을 공통으로 감지해 세션을 정리하고 로그인 화면으로 이동하도록 수정한 커밋입니다.', meta: '커밋 a3f21bc · 2일 전', status: '푸시', labels: ['인증', '버그', '푸시'], daysAgo: 2, before: '토큰이 만료되면 빈 화면이 표시됨', after: '토큰 만료를 감지하면 로그인 화면으로 이동함' },
      { id: 'figma-dashboard-cards', service: 'Figma', reference: '대시보드', title: '대시보드 카드 컴포넌트 정리', description: '미정리 변경사항, 최근 Story 카드의 간격과 상태 배지를 컴포넌트로 묶었습니다.', meta: '파일 업데이트 · 5일 전', status: '업데이트', labels: ['디자인', '컴포넌트', '대시보드'], daysAgo: 5, before: '대시보드 카드마다 간격과 배지 모양이 달랐음', after: '카드 간격과 상태 배지를 공통 컴포넌트로 맞춤' },
      { id: 'github-project-search', service: 'GitHub', reference: 'PR #179', title: 'feat: 프로젝트 목록 검색 추가', description: '프로젝트명을 입력하면 카드 목록을 바로 걸러주는 검색 입력을 추가했습니다.', meta: 'PR #179 · 12일 전', status: '오픈', labels: ['기능', '검색', '오픈'], daysAgo: 12, before: '프로젝트가 많을 때 원하는 프로젝트를 찾기 어려웠음', after: '프로젝트명으로 목록을 바로 걸러볼 수 있음' },
    ],
    stories: [
      story('payment-dialog', '초안', '2026.09.03', ['GitHub'], {
        title: '결제 다이얼로그 컴포넌트 추가',
        summary: '결제 확인과 취소 흐름을 하나의 다이얼로그로 정리했습니다.',
        why: '결제 확인 단계가 화면마다 달라 사용자가 흐름을 예측하기 어려웠습니다.',
        problem: '결제 확인과 취소 버튼의 위치와 문구가 화면마다 달라\n실수로 결제를 취소하는 경우가 있었습니다.',
        solution: '확인·취소 흐름을 하나의 다이얼로그 컴포넌트로 묶고\n위험한 동작은 빨간 버튼으로 구분했습니다.',
        memo: '결제 실패 상태 디자인이 나오면 결과와 배운 점을 이어서 작성하기.',
        before: '결제 확인 방식이 화면마다 달랐음',
        after: '모든 결제 확인을 같은 다이얼로그로 처리함',
        tags: ['React', '컴포넌트'],
      }),
      loginStory,
      story('design-docs', '완료', '2026.09.01', ['Notion'], {
        title: '디자인 시스템 문서 업데이트',
        summary: '컴포넌트 상태와 사용 원칙을 문서로 정리했습니다.',
        why: '디자인과 개발이 같은 기준으로 컴포넌트를 쓰도록 문서를 최신화할 필요가 있었습니다.',
        result: '컴포넌트 상태 예시와 사용 가이드를 한곳에서 확인할 수 있게 되었습니다.',
        tags: ['문서', '디자인'],
      }),
      story('project-card-layout', '완료', '2026.09.01', ['Figma'], {
        title: '프로젝트 카드 레이아웃 개선',
        summary: '프로젝트의 상태와 최근 작업을 한눈에 볼 수 있도록 카드를 정리했습니다.',
        problem: '프로젝트 카드마다 정보 위치가 달라 상태를 빠르게 비교하기 어려웠습니다.',
        solution: '상태 배지와 연결된 도구 아이콘의 위치를 카드 전체에서 통일했습니다.',
        tags: ['React', 'UI'],
      }),
      story('onboarding-copy', '완료', '2026.08.27', ['Notion'], {
        title: '온보딩 안내 문구 정리',
        summary: '처음 방문한 사용자가 프로젝트를 만들기까지의 안내 문구를 다듬었습니다.',
        learned: '짧은 안내 문구가 기능 설명보다 행동을 더 잘 이끈다는 점을 확인했습니다.',
        tags: ['문서', '온보딩'],
      }),
      story('dashboard-stats', '초안', '2026.08.21', ['GitHub', 'Figma'], {
        title: '대시보드 통계 카드 추가',
        summary: '서비스별 미정리 변경사항 개수를 대시보드 상단에 보여주도록 했습니다.',
        tags: ['React', '대시보드'],
      }),
      story('figma-integration', '완료', '2026.08.14', ['Figma'], {
        title: 'Figma 연동 설정 화면 설계',
        summary: 'Figma 파일 URL로 프로젝트를 연결하는 흐름을 설계했습니다.',
        next: 'Notion 연동도 같은 흐름으로 맞출 예정입니다.',
        tags: ['Figma', '연동'],
      }),
      story('retro-template', '초안', '2026.08.05', ['Notion'], {
        title: '회고 템플릿 항목 정리',
        summary: 'Why, 문제, 해결과정, 결과, 배운 점 순서로 회고 항목을 정리했습니다.',
        tags: ['기획', '로그인'],
      }),
    ],
    commits: [
      { sha: 'a3f21bc', message: 'fix: 인증 토큰 만료 시 빈 화면 노출 수정', date: '09/03 3분전', additions: 28, deletions: 3, state: 'main 푸시' },
      { sha: 'f7e92da', message: 'feat: 로그인 폼 UI 컴포넌트 구현', date: '09/03 30분전', additions: 666, deletions: 192, state: 'main 머지' },
    ],
  },
  {
    id: 'portfolio',
    name: '포트폴리오',
    description: '작업의 과정과 결과를 한곳에 모아 보여주는 개인 포트폴리오 사이트',
    status: '완료',
    updatedAt: '2주전',
    services: {
      GitHub: { status: 'connected' },
      Figma: { status: 'connected' },
      Notion: { status: 'connected' },
    },
    repositories: ['portfolio-site', 'portfolio-assets'],
    selectedRepository: 'portfolio-site',
    changes: [
      { id: 'portfolio-deploy', service: 'GitHub', reference: 'PR #12', title: 'chore: 배포 설정 정리', description: '정적 사이트 빌드와 배포 설정을 정리한 PR입니다.', meta: 'PR #12 · 2일 전', status: '머지', labels: ['배포', '설정', '머지'], daysAgo: 2, before: '배포할 때마다 수동으로 빌드 결과를 올렸음', after: '머지하면 자동으로 빌드와 배포가 진행됨' },
      { id: 'portfolio-notes', service: 'Notion', reference: '작업 노트', title: '프로젝트 소개 문구 수정', description: '각 프로젝트 소개 문구를 결과 중심으로 다시 썼습니다.', meta: '페이지 업데이트 · 3일 전', status: '업데이트', labels: ['문서', '소개', '업데이트'], daysAgo: 3, before: '프로젝트 소개가 기능 나열 위주였음', after: '프로젝트 소개를 문제와 결과 중심으로 정리함' },
    ],
    stories: [
      story('portfolio-launch', '완료', '2026.09.08', ['GitHub'], {
        title: '포트폴리오 사이트 배포',
        summary: '프로젝트 상세 페이지를 정리하고 정적 사이트로 배포했습니다.',
        tags: ['배포'],
      }),
    ],
    commits: [
      { sha: '9c1d4e0', message: 'chore: 배포 설정 정리', date: '09/08 2일전', additions: 12, deletions: 40, state: 'main 머지' },
    ],
  },
  {
    id: 'design-system',
    name: '디자인 시스템',
    description: '팀이 함께 쓰는 컴포넌트와 디자인 원칙을 기록하는 프로젝트',
    status: '사용자',
    updatedAt: '1달전',
    services: {
      GitHub: { status: 'connected' },
      Figma: { status: 'reconnect' },
      Notion: { status: 'connected' },
    },
    repositories: ['design-tokens', 'ui-components'],
    selectedRepository: null,
    changes: [],
    stories: [],
    commits: [],
  },
];

// 실제 AI 대신 선택한 변경사항의 예시 문장으로 분석 결과를 구성합니다.
export function createAnalysis(changes: Change[], mode: AnalysisMode): Analysis {
  const changeIds = changes.map((change) => change.id);
  const [first] = changes;
  const labels = changes.map((change) => change.labels[0]).filter((label): label is string => !!label);
  return {
    changeIds,
    mode,
    tags: ['AI 생성', ...new Set(labels)].slice(0, 4),
    title: changes.length > 1 ? `${first.title} 외 ${changes.length - 1}건` : first?.title ?? '',
    before: changes.map((change) => change.before).join('\n'),
    after: changes.map((change) => change.after).join('\n'),
    summary: changes.map((change) => mode === '코드 상세' ? `${change.service} ${change.reference}: ${change.description}` : change.description).join('\n'),
  };
}

export function todayLabel(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

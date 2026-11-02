# Figma·Notion 변경사항 API 인수인계

## 연결 완료 범위
- `src/api/externalActivities.ts`: MOEUM 액세스 토큰으로 수집 후 미정리 변경사항 조회.
- `src/api/activities.ts`: Figma·Notion 로더 등록. GitHub 기존 조회 유지.
- `src/state/ProjectsContext.tsx`: 프로젝트 진입·URL 변경 시 수집, 서비스별 새로고침과 취소·오류·결과 반영.
- `src/pages/DashboardPage.tsx`: 서비스별 개수·수집 중·오류·새로고침.
- `src/pages/ChangesPage.tsx`: 수집 결과 목록, 0건, 로딩, 오류·재시도, 서비스별 새로고침.

## 백엔드 계약
로컬 백엔드의 project_integrations.py, project_github.py, project_activity.py 기준.

| 순서 | API | 처리 |
| --- | --- | --- |
| 1 | POST /api/projects/{project_id}/figma/sync | has_next=true이면 next_cursor를 cursor 쿼리로 전달해 계속 수집 |
| 1 | POST /api/projects/{project_id}/notion/sync | 연결된 페이지 최근 수정 상태 수집 |
| 2 | GET /api/projects/{project_id}/activities?source=figma 또는 notion&unorganized=true&limit=100&offset=0 | 100건 단위 전체 조회, activity_id를 화면 ID로 매핑 |

Authorization: Bearer에는 앱 로그인 토큰만 사용합니다. Figma·Notion 토큰은 백엔드 환경 변수에서 관리합니다.
수집 생성 건수가 0이어도 기존 DB 목록을 다시 조회합니다. 수집·조회 실패는 빈 배열로 바꾸지 않으며 이전 목록을 유지하고 오류를 표시합니다.
서비스별 새로고침은 해당 서비스만 재수집합니다. 진행 중 버튼은 비활성화합니다.
프로젝트·URL 변경 시 진행 중 브라우저 요청을 취소하고 이전 응답을 무시합니다. 이미 시작한 서버 수집은 브라우저 취소 후에도 완료될 수 있습니다.
Notion은 전체 과거 편집 기록·하위 페이지를 수집하지 않습니다. Figma는 현재 버전과 버전 기록을 수집합니다.

## 검증 결과와 제한
- `node --test tests/*.test.mjs`: 21개 통과. 새 테스트 7개는 실제 공통 HTTP 클라이언트를 사용하되 fetch 응답을 모의 처리합니다.
- Figma 수집/조회 페이지네이션, Notion 기존 데이터 조회·빈 목록, 403/500, 잘못된 응답, 중복 커서, 취소 확인.
- Render의 openapi.json 접근은 실행 환경의 호스트 이름 해석 실패로 확인하지 못했습니다.
- 따라서 실제 계정의 외부 토큰·권한, DB 저장, 브라우저 표시까지의 실서버 통합 검증은 미완료입니다.

## 실제 계정 확인 절차
1. 최신 수집 API가 배포된 백엔드와 Figma·Notion 토큰·접근 권한을 설정합니다.
2. 프론트 로그인 후 해당 URL이 저장된 프로젝트를 엽니다.
3. 대시보드에서 수집 중 → 개수 또는 오류 메시지 전환을 확인합니다.
4. 변경사항 전체 보기에서 서비스 필터·전체 기간으로 실제 제목과 날짜를 확인합니다.
5. Figma/Notion 원본 수정 후 해당 서비스 새로고침을 눌러 POST 완료 → GET 목록 갱신을 확인합니다.
6. 수집 실패 시 오류/재시도, 결과가 없으면 0개가 표시되는지 확인합니다.

## 다른 담당자에게 남기는 범위
GitHub 백엔드 수집/조회 전환, 대시보드 요약 API, Story CRUD, AI 분석, 수집 이력 API는 추가 연결하지 않았습니다.
현재 Story 작성·정리는 프론트 메모리 상태입니다. 서버 저장·복원은 별도 연결이 필요합니다.

# Story API 연동

2026-11-18 배포된 https://fastapi-practice-jwse.onrender.com/openapi.json 기준.

## 화면 흐름과 API

| 작업 | 요청 |
| --- | --- |
| S5 선택 → S6 분석 | `POST /stories/analyze` — `project_id`, 숫자형 `activity_ids` 1~20개 |
| S6 작성 시작 / 직접 작성 | `POST /stories` — `project_id`, `title`, `story_status: draft`, `activity_ids`, 작성 필드 |
| S7 / S9 상세 | `GET /stories/{id}` |
| S7 자동 저장 | `PATCH /stories/{id}` — 변경한 필드만 전송, 상태는 생략 |
| 초안 저장 | 같은 PATCH에 `story_status: draft` |
| 작성·수정 완료 | 같은 PATCH에 `story_status: published` |
| S4 최근 Story / S8 타임라인 | `GET /stories?project_id={id}&limit=100&offset=...` |
| 출처·변경사항 복원 | `GET /api/projects/{id}/activities?unorganized=false` — 상세는 `story_id` 추가 |
| S9 삭제 | `DELETE /stories/{id}` — 성공 204 후 목록 반영 및 변경사항 재조회 |

요청은 기존 `apiRequest`와 MOEUM Bearer 토큰을 사용합니다. 기본 개발 URL은 `.env.local`에 설정했습니다. 비밀 키는 프론트에 넣지 않습니다.

## 필드 매핑

- `title`, `why`, `problem`, `solution`, `result`, `learned`: 동일한 API 필드 사용.
- 프론트 `next` → 서버 `next_steps`.
- `summary`, `before`, `after`, `tags`: `ai_analysis` JSON 안에 보관.
- 서버에 `memo` 전용 필드가 없어 메모는 `ai_analysis.moeum_editor = { version: 1, memo }`로 저장. 기존 `content`를 메모로 해석하거나 덮어쓰지 않음.
- 알 수 없는 `ai_analysis` 객체 키를 수정 시 보존. 입력을 지운 경우 빈 문자열을 명시적으로 보내고 AI 추천값으로 되돌리지 않음.
- `draft` → 초안, `published` → 완료. 서버에 없는 진행중 상태 필터와 분석 방식 선택은 화면에서 제거.
- 제목: 1~200자. 회고·메모: 항목당 15,000자. 분석 요약·Before/After: 3,000자. 태그: 40자 이내, 최대 10개.

## 변경사항 ID

`Change.activityId`에 DB ID를 별도로 보관합니다. 화면 식별자는 `figma:101` 등의 형태를 유지합니다. SHA나 화면 문자열을 숫자형 ID로 추정해서 전송하지 않습니다.

GitHub는 `/api/projects/{id}/github/branches`의 모든 페이지를 조회하고, 각 브랜치의 `/github/sync` 페이지를 수집한 후 미정리 activity 목록을 조회합니다. 대시보드의 최근 커밋 표는 기존 공개 GitHub API 조회를 유지합니다. Figma 수집 대기·커서 동작은 기존 방식대로 유지합니다.

## 저장 동작

- 분석 API는 Story ID를 반환하지 않으므로 S6의 작성 시작 버튼에서 초안을 생성합니다. 중복 클릭·동시 생성 요청을 묶습니다.
- 직접 작성은 제목을 먼저 입력하고 초안을 만듭니다. 새로고침 가능한 `/stories/{id}/edit` 경로로 이동합니다.
- 자동 저장은 마지막 입력에서 1초 후 실행합니다. Story별 요청을 순서대로 처리하고 완료 요청도 같은 대기열에 넣습니다.
- 응답이 늦게 도착해도 요청 이후 입력한 필드는 지우지 않습니다. 서버 응답과 동일한 입력만 저장 대기 상태에서 제거합니다.
- 실패 시 입력을 보존하고 오류·재시도를 표시합니다. 저장되지 않은 입력이 있을 때 브라우저 새로고침/닫기를 안내합니다. 화면 이동 시 유효한 미저장 입력의 저장을 시도하며, 실패한 입력은 현재 앱 세션의 메모리에 남습니다.
- 완료된 Story의 자동 저장은 상태를 보내지 않아 draft로 되돌리지 않습니다.
- 목록·상세 조회 중, 실패, 빈 상태를 구분합니다. 다른 프로젝트의 상세 링크도 서버의 `project_id`를 확인해 전환합니다.

## 서버 규약의 제한

- 별도의 `/complete` 경로는 없습니다. 발행은 PATCH의 `published`로 처리합니다.
- 초안 생성 때 activity를 연결하므로 초안도 미정리 목록에서 제외됩니다. 완료 시점에만 정리하려면 서버 규약 변경이 필요합니다.
- 저장 충돌용 버전/ETag 조건부 갱신 규약이 없어 여러 탭·사용자 간 동시 수정 방지는 보장하지 않습니다. 현재 대기열은 이 앱 인스턴스 안의 요청 순서만 보장합니다.
- AI 응답은 제목·태그·요약·Before/After만 제공합니다. Why·문제·해결 과정·결과 추천은 서버 응답 확장이 필요합니다.
- P1 대안·커스텀 템플릿, 전용 메모 및 태그 테이블 API는 배포 명세에 없어 추가하지 않았습니다.
- 자동 저장 실패 후 강제로 새로고침하면 서버에 저장되지 않은 입력은 복원할 수 없습니다.

## 검증

- `npm run build`
- `npm test`: 35개 테스트 통과.
- `npm run test:browser`: 설치된 Chrome과 모의 API로 11개 시나리오 검증. 로컬 Vite 서버를 5187 포트에 자동 실행하고 종료합니다. Chrome이 없으면 `npx playwright install chromium` 후 `TEST_BROWSER=chromium npm run test:browser`로 실행합니다. 결과와 캡처는 시스템 임시 폴더의 `moeum-story-browser`에 저장합니다.
- 추가 API 테스트: 초안 생성/조회 왕복, 메모·분석 복원, 부분 수정·기존 메타데이터 보존, published 전환, 목록 페이지네이션, 권한/서버 오류 전파, 204 삭제, ID/필드 검증, AI 오류, GitHub 수집 페이지네이션.
- 브라우저 검증: AI 분석→초안 생성, 저장 중 추가 입력 보존, 저장 대기 후 완료, 새로고침 복원, 저장 실패·재시도, 발행 상태 유지, 다른 프로젝트 상세 링크, 삭제, 직접 작성·초안 저장, 모바일 가로 넘침, 분석 중 화면 이동 시 요청 취소 확인.
- 로컬 Vite 프록시에서 배포 서버의 `GET /stories`에 도달해 인증 없는 요청에 401 (`로그인이 필요합니다.`)이 반환되는 것을 확인했습니다.
- 실제 계정 통합 확인(2026-11-18): `API 연동 확인용` 프로젝트와 `[연동 테스트] Story 저장 확인`(Story ID `30001`)을 실제 서버에 생성했습니다. 회고 6개 항목·태그·메모 자동 저장, 새로고침 복원, 명시적 초안 저장, 수정 후 완료 전환, 완료 상태의 새로고침 유지 및 타임라인 반영을 브라우저에서 확인했습니다. 확인용 데이터는 계정에 남겨 두었습니다.
- 실제 AI 분석은 미검증입니다. 연결한 GitHub 저장소의 서버 측 변경사항 수집에서 `GitHub 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.`가 표시되어 분석할 activity를 선택할 수 없었습니다. 요청 한도 문제 해결 후 AI 분석→초안 생성 흐름을 추가 확인해야 합니다. 실제 삭제는 수행하지 않았습니다.

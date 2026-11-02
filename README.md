# moeum

## 로컬 실행

프론트 프로젝트의 .env에 아래 주소를 설정합니다. .env.example을 복사해도 됩니다.

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

백엔드 프로젝트에서 실행합니다. MySQL도 실행 중이어야 합니다.

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

프론트 프로젝트에서 실행합니다. 설정을 바꿨다면 기존 개발 서버를 종료한 뒤 다시 실행합니다.

```bash
npm run dev
```

개발 중에는 브라우저가 /backend로 요청하고 Vite 프록시가 .env의 서버로 전달합니다.
예: /backend/api/auth/login → http://127.0.0.1:8000/api/auth/login.
/docs는 문서 주소이므로 기본 서버 주소에 붙이지 않습니다.
빌드된 프론트는 VITE_API_BASE_URL로 직접 요청하므로 백엔드 CORS 허용이 필요합니다.
배포 시에는 접근 가능한 온라인 백엔드와 DB 주소를 별도로 설정해야 합니다.
프론트의 VITE_ 변수는 공개됩니다. DB 비밀번호와 Client Secret은 백엔드에서만 설정합니다.

## 인증 API 연결

| 화면 / 기능 | API | 요청 데이터 |
| --- | --- | --- |
| 로그인 | POST /api/auth/login | email, password |
| 회원가입 (/signup) | POST /api/auth/signup | user_id, name, email, password |
| 이메일 확인 | POST /api/auth/password/check-email | email |
| 인증번호 발송 / 재발송 | POST /api/auth/password/request-code | email |
| 인증번호 확인 | POST /api/auth/password/verify-code | email, code |
| 비밀번호 변경 | POST /api/auth/password/reset | reset_token, new_password, confirm_password |
| 내 정보 | GET /api/auth/me | Authorization: Bearer 토큰 |
| 로그아웃 | POST /api/auth/logout | Authorization: Bearer 토큰 |
| GitHub 로그인 시작 | GET /api/auth/github/login | 서버에서 OAuth 시작 |
| GitHub 인증 완료 | GET /api/auth/github/callback | code, state 또는 error |

- src/api/client.ts: 공통 fetch 요청, JSON 응답 및 오류 처리.
- src/api/auth.ts: 인증 요청 함수, 로그인 토큰 저장과 삭제.
- src/pages/LoginPage.tsx: 로그인 및 회원가입·비밀번호 찾기 화면 이동.
- src/pages/AccountPage.tsx: 회원가입과 단계별 비밀번호 재설정.
- src/pages/GithubCallbackPage.tsx: GitHub 인증 결과를 서버와 교환하고 로그인 완료.
- src/components/AuthBoundary.tsx: 내 정보 확인, 로그인하지 않은 사용자의 접근 제한, 사용자 이름과 로그아웃 버튼.

회원가입이 완료되면 이메일로 로그인합니다. 중복된 계정 등 서버 오류는 화면에 표시합니다.
회원가입 비밀번호는 백엔드 명세에 맞춰 8~128자를 허용합니다.
재설정 비밀번호는 영문·숫자·특수문자를 포함한 8~16자이며 공백은 허용하지 않습니다.
인증번호는 6자리입니다. 재발송 제한(60초)과 인증 실패·만료는 서버 응답으로 안내합니다.
재설정 토큰은 컴포넌트 메모리에만 보관합니다. 새로고침하면 이메일 인증부터 다시 진행합니다.
비밀번호 찾기의 실제 메일 수신은 백엔드 SMTP 설정이 필요합니다.
로그인 토큰은 sessionStorage의 moeum.access_token에 저장하며 비밀번호는 저장하지 않습니다.
보호된 화면을 열 때 /me로 세션을 확인합니다. 로그아웃은 서버 세션 삭제가 성공한 뒤 토큰을 삭제합니다.
아이디 찾기는 해당 백엔드 API가 없고 이메일로 로그인하므로 로그인 화면에서 제거했습니다.
프로젝트 CRUD는 실제 서버와 연결합니다. Story·변경 기록·AI 분석은 별도 API 연결 전까지 프론트 메모리에서 처리하며, 서버 프로젝트에 예시 기록을 넣지 않습니다.

## 프로젝트 API 연결

로컬 백엔드의 `/openapi.json` 명세를 기준으로 연결했습니다. 기존 로그인 토큰을 Authorization 헤더에 전달합니다.

| 기능 | API | 화면 |
| --- | --- | --- |
| 목록 조회 | GET /projects?limit=100&offset=0&project_status=all | 프로젝트 목록·헤더 프로젝트 선택 |
| 상세 조회 함수 | GET /projects/{project_id} | 필요 시 상세 재조회용 |
| 생성 | POST /projects | 프로젝트 생성 |
| 부분 수정 | PATCH /projects/{project_id} | 설정의 이름·설명·도구 URL |
| 영구 삭제 | DELETE /projects/{project_id} | 설정의 삭제 확인 모달 |

- `src/api/projects.ts`: API 요청과 서버 응답을 화면 데이터로 바꾸는 함수. 목록은 100개씩 끝까지 조회합니다.
- 로그인 확인 후 프로젝트를 불러옵니다. 로딩 스켈레톤·실패 시 재시도·빈 목록을 구분합니다.
- 생성·수정·삭제는 서버 성공 후 화면 상태에 반영합니다. 실패하면 입력값과 프로젝트를 유지하고 오류를 안내합니다.
- 설정의 이름·설명은 Enter 또는 포커스를 옮길 때 변경된 필드만 저장합니다. 저장 중 중복 요청을 막고 서버 응답 후 성공을 표시합니다.
- GitHub·Figma·Notion은 생성 화면에서 URL을 입력하고 설정에서 수정·해제할 수 있습니다. GitHub 공개 저장소의 최근 기록은 대시보드에서 직접 조회합니다. URL 저장 자체는 OAuth 권한을 부여하지 않습니다.
- 마지막으로 선택한 프로젝트 ID만 로그인 회원별 sessionStorage에 저장합니다. 프로젝트 원본은 새로고침 시 서버에서 조회합니다.
- 보관·보관 해제 API는 현재 화면에 버튼이 없어 연결하지 않았습니다. 서버의 보관 상태는 목록에 표시합니다.
- 인증 헤더, 페이지 조회, 부분 수정 요청, 본문 없는 204 삭제 응답, 오류 응답과 데이터 변환을 모의 응답으로 검증했습니다.
- 2026-10-21 로컬 서버에서 실제 프론트 API 모듈과 Vite 프록시를 통해 테스트 계정 생성·로그인, 프로젝트 생성(201)·목록/상세 조회(200)·부분 수정(200), 로그아웃 후 재로그인 시 데이터 유지, 영구 삭제(204)와 삭제 후 상세 조회(404)를 확인했습니다. 테스트 프로젝트는 삭제했고 테스트 계정(ID 11)은 남아 있습니다. 브라우저 클릭 기반 화면 검증은 별도로 필요합니다.

## GitHub OAuth 추가 설정

프론트 버튼과 콜백 처리는 연결되어 있지만, GitHub 로그인을 완성하려면
백엔드 .env의 GITHUB_REDIRECT_URI와 GitHub OAuth App의 Authorization callback URL을
둘 다 실제 프론트 주소의 /auth/github/callback으로 설정해야 합니다.
기본 개발 주소를 사용할 때의 예:

```env
GITHUB_REDIRECT_URI=http://127.0.0.1:5173/auth/github/callback
```

GITHUB_CLIENT_ID와 GITHUB_CLIENT_SECRET도 백엔드에 설정한 뒤 백엔드를 재시작합니다.
프론트는 같은 호스트와 포트로 접속해야 합니다. localhost와 127.0.0.1을 섞지 않습니다.
Vite 프록시의 cookiePathRewrite는 OAuth state 쿠키를 콜백 요청에도 전달하도록 설정합니다.
기존 백엔드 콜백 주소(8000 포트)를 그대로 두면 프론트 대신 JSON 응답 화면으로 이동합니다.
배포 시 서로 다른 출처에서 OAuth를 사용할 경우 쿠키, credentials 및 백엔드 CORS 설정도 맞춰야 합니다.

## 확인

## 공통 모달과 화면 안내

- 선택·확인 모달은 `ConfirmDialog`를 재사용합니다. 선택 확정은 `tone="primary"`, 삭제는 `tone="danger"`로 구분하며 취소·Escape·배경 클릭을 지원합니다.
- 대시보드는 S3에서 저장한 `github_url`의 저장소를 사용합니다. 별도 Repository 선택 단계는 없습니다.
- `PageGuide`는 프로젝트 목록부터 우측 하단에 표시합니다. 버튼에 hover하거나 키보드 focus를 두면 현재 화면의 활동 안내 한 줄이 나오며, 로그인·회원가입·비밀번호 찾기에는 표시하지 않습니다. 터치로도 열 수 있고 Escape로 닫을 수 있습니다.

### 인증 화면 스타일과 로딩

- Figma 로그인 / 회원가입 / 비밀번호 찾기 컴포넌트를 기준으로 카드(460px), 입력창(56px), 버튼, 오류·성공 안내를 공통화했습니다.
- 입력창 좌우 padding은 요청에 따라 32px에서 16px로 줄였습니다.
- `src/components/AuthUI.tsx`: 공통 인증 레이아웃, 입력창, 버튼, 요청 중 표시.
- `src/components/Skeleton.tsx`: 입력 폼, GitHub 인증, 로그인 세션 조회의 스켈레톤.
- 회원가입은 이름·아이디 → 이메일 → 비밀번호 → 완료 순서입니다. 별도 아이디와 비밀번호 확인은 현재 백엔드 연동에 맞춰 유지합니다.
- 이메일 중복은 회원가입 서버 응답에서 확인하며, 별도의 중복 조회 API가 없으므로 입력만으로 사용 가능하다고 안내하지 않습니다.
- 비밀번호 찾기는 이메일 확인 → 인증번호 발송 → 인증번호 확인 → 새 비밀번호 설정 순서입니다.
- 요청 중 기존 폼과 입력값은 유지하고 같은 위치에 스켈레톤을 표시합니다. 중복 제출과 입력은 막습니다.
- 스켈레톤은 화면 읽기 도구에 로딩 상태를 알리며, 움직임 줄이기 설정에서는 애니메이션을 끕니다.
- 빌드와 React 서버 렌더링 검사를 수행했습니다. 이 환경에서는 브라우저 자동 실행이 차단되어 캡처 기반 시각 검증은 완료하지 못했습니다.

- 빌드: npm run build
- F12 → Network에서 요청 경로, 상태 코드와 Response를 확인합니다.
- API 전송 규약은 로컬 백엔드 라우터 및 Pydantic 스키마를 기준으로 작성했습니다.
- 실제 MySQL·SMTP·GitHub 로그인 성공 여부는 해당 서비스가 실행된 환경에서 확인해야 합니다.

## 대시보드 GitHub 실시간 조회

- `src/api/github.ts`: GitHub 공식 REST API로 공개 저장소 메타데이터, 전체 브랜치 목록(100개씩 페이지 조회), 선택한 브랜치의 최신 커밋 5개와 각 커밋의 추가/삭제 줄 수를 조회합니다.
- `src/components/GitHubActivity.tsx`: 미연결, 조회 중, 빈 저장소, 오류, 정상 목록을 구분합니다. 브랜치 변경·프로젝트 변경·URL 변경·화면 이탈 시 이전 요청을 취소합니다. 자동 폴링은 하지 않으며 새로고침 버튼으로 다시 조회합니다.
- 미연결이면 안내와 ‘설정에서 연결하기’를 표시합니다. 오류는 재시도와 연결 설정 링크를 제공합니다. 일부 통계만 실패하면 커밋은 유지하고 해당 줄 수를 `—`로 표시합니다.
- 기본 브랜치는 GitHub 응답을 사용합니다. 커밋과 전체 보기 링크는 실제 GitHub 화면을 엽니다. 부모가 2개 이상인 경우 ‘머지 커밋’으로 표시하며, 커밋 API에서 알 수 없는 푸시 이벤트를 추정하지 않습니다.
- 모음 로그인 토큰은 GitHub에 전달하지 않습니다. 현재 구현은 공개 저장소만 지원합니다. 비공개 저장소는 백엔드에 GitHub 토큰 보관 및 권한 기반 조회 API가 있어야 지원할 수 있습니다. 미인증 GitHub API의 요청 제한에 걸리면 오류 안내를 표시합니다.
- 프로젝트를 열면 모든 브랜치의 커밋 목록을 100개씩 끝까지 조회하고 SHA 중복을 제거해 `project.changes`에 반영합니다. 대시보드 미정리 개수와 S5 목록은 이 데이터를 공유합니다. 최근 커밋 표는 선택 브랜치의 5개만 보여줍니다.
- Story 작성 완료 시 `sourceChangeIds`를 보관해 같은 세션에서 재조회한 커밋이 미정리 목록으로 되돌아오지 않도록 합니다. Story와 정리 여부의 서버 영구 저장은 아직 없으므로 브라우저 새로고침 후에는 유지되지 않습니다. 조회 중/실패를 0개와 구분하고 S5에서도 재시도할 수 있습니다.
- 회귀 검증: `node --test tests/github-api.test.mjs`, 빌드: `npm run build`.

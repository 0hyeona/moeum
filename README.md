# 모음 (moeum) 프론트엔드

GitHub 커밋, Figma 디자인 수정, Notion 문서 변경을 프로젝트별로 모아 작업의 배경과 결과를 **Story**로 기록하는 React 웹 앱입니다.

## 목차

- [프로젝트 링크 및 서버 정보](#프로젝트-링크-및-서버-정보)
- [프로젝트 소개](#프로젝트-소개)
- [프로젝트 구조](#프로젝트-구조)
- [설치 및 실행 방법](#설치-및-실행-방법)
- [환경 정보](#환경-정보)

## 프로젝트 링크 및 서버 정보

| 구분 | 용도 | 링크 |
| --- | --- | --- |
| 웹 서비스 · Vercel | 모음 로그인 및 프로젝트 이용 | [모음 열기](https://moeum-log.vercel.app/) |
| 백엔드 API · Render | 인증, 프로젝트, 변경사항, Story 요청 처리 | [fastapi-practice-jwse.onrender.com](https://fastapi-practice-jwse.onrender.com) |
| API 문서 · Swagger UI | 엔드포인트별 요청·응답 형식 확인 | [운영 Swagger](https://fastapi-practice-jwse.onrender.com/docs) |
| 프론트엔드 저장소 | React 웹 앱과 Figma 플러그인 | [0hyeona/moeum](https://github.com/0hyeona/moeum) |
| 백엔드 저장소 | FastAPI 서버와 DB 스키마 | [0hyeona/fastapi-practice](https://github.com/0hyeona/fastapi-practice) |

Vercel에 배포된 웹 앱은 Render의 FastAPI 서버를 호출합니다. 서버는 프로젝트, 변경사항, Story를 TiDB에 저장합니다.

## 프로젝트 소개

작업을 마친 뒤에는 커밋만 보고 디자인을 바꾼 이유까지 떠올리기 어렵습니다. 모음에서는 같은 작업에서 나온 기록을 하나의 Story로 묶습니다. 예를 들어 Figma의 로그인 버튼 수정과 GitHub의 구현 커밋을 함께 선택하고, 어떤 문제를 해결했는지 적어 둘 수 있습니다.

1. **프로젝트**를 만들고 GitHub 저장소, Figma 파일, Notion 페이지 중 사용하는 도구의 주소를 등록합니다.
2. **대시보드**에서 아직 Story로 정리하지 않은 기록을 확인합니다. Figma 편집 기록은 대시보드에서 발급한 연결 코드와 파일 공유 링크를 ‘모음 실시간 연결’ 플러그인에 입력해 수집합니다.
3. **Story 작성**에 사용할 변경사항을 1~20개 선택하면 서버가 저장된 기록과 확인 가능한 GitHub 코드 차이(diff)를 규칙 기반으로 요약합니다. 초안에 변경 이유와 배운 점을 덧붙이거나 직접 작성할 수 있습니다.
4. **타임라인**에서 저장한 Story를 시간순으로 살펴보고 검색어나 태그로 다시 찾습니다.

## 프로젝트 구조

```text
moeum/
├── src/
│   ├── main.tsx            # 앱 진입점과 페이지 라우팅
│   ├── pages/              # 로그인, 대시보드, Story, 타임라인 화면
│   ├── components/         # 공통 레이아웃, 카드, 입력 폼, 모달
│   ├── api/                # 공통 HTTP 클라이언트와 기능별 API 요청
│   ├── state/              # 로그인·프로젝트 상태와 데이터 조회 훅
│   ├── data/               # 변경 기록 변환과 Story 초안 처리
│   └── styles/             # 전역 스타일
├── assets/                 # 로고, 아이콘, 글꼴
├── public/                 # 파비콘 등 정적 파일
├── figma-plugin-local/     # Figma 편집기에서 실행하는 플러그인
├── tests/                  # API 및 브라우저 테스트
├── docs/                   # 기능별 연동 문서
├── .env.example            # 프론트엔드 환경변수 예시
├── package.json            # npm 명령과 패키지 목록
├── vite.config.ts          # 개발 서버와 API 프록시 설정
└── vercel.json             # 배포 사이트의 화면 라우팅 설정
```

코드와 문서 바로가기

- [페이지 라우팅](./src/main.tsx) · [공통 API 클라이언트](./src/api/client.ts)
- [Story 작성 화면](./src/pages/StoryWritePage.tsx) · [Story API 모듈](./src/api/stories.ts) · [Story API 연동 문서](./docs/story-api-integration.md)

## 설치 및 실행 방법

### 배포된 API로 프론트엔드 실행

Git, Node.js, npm이 필요합니다. 아래 명령은 Windows PowerShell 기준이며 macOS와 Linux에서는 같은 npm 명령을 사용할 수 있습니다.

처음 내려받을 때는 저장소를 복제합니다.

```sh
git clone https://github.com/0hyeona/moeum.git
cd moeum
```

프로젝트 폴더에서 패키지를 설치하고, `.env`가 없으면 예시 파일을 복사한 뒤 개발 서버를 실행합니다.

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Bash(Git Bash, macOS, Linux)에서는 위 블록의 환경 파일 복사 줄에 `test -f .env || cp .env.example .env`를 사용합니다.

터미널에 표시된 `Local` 주소를 엽니다. 기본값은 [http://127.0.0.1:5173](http://127.0.0.1:5173)입니다. 예시 환경 파일은 배포된 Render API를 사용하므로, 이 구성에서 저장하는 프로젝트와 Story는 운영 DB에 반영됩니다.

### 로컬 FastAPI로 전환

1. 별도 터미널에서 `fastapi-practice` 폴더를 엽니다. Python 가상환경, `requirements.txt` 패키지와 개발용 DB가 준비되어 있으면 서버를 실행합니다.

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
   ```

2. 프론트엔드의 `.env.local`에 로컬 서버 주소를 설정합니다.

   ```dotenv
   VITE_API_BASE_URL=http://127.0.0.1:8000
   ```

3. 프론트 개발 서버를 `npm run dev`로 다시 시작합니다. API 목록은 [로컬 Swagger](http://127.0.0.1:8000/docs)에서 확인할 수 있습니다.

기본 Figma 플러그인은 Render에 데이터를 보냅니다. 플러그인 연결을 시험할 때는 프론트도 Render API에 연결해 같은 서버에서 코드를 발급받으세요. [플러그인 매니페스트](./figma-plugin-local/manifest.json) · [Figma 실시간 연결 안내](./docs/connection-deployment-check.md)

### 테스트와 빌드

| 명령 | 결과 |
| --- | --- |
| `npm test` | API 응답 처리와 화면 데이터 변환 등 자동 테스트를 실행합니다. |
| `npm run test:browser` | Playwright로 Story 작성 흐름을 검증합니다. 기본 브라우저는 로컬 Chrome입니다. |
| `npm run build` | TypeScript 타입 검사 후 배포 파일을 `dist/`에 생성합니다. |
| `npm run preview` | 빌드한 `dist/`를 로컬에서 미리 봅니다. |

## 환경 정보

| 영역 | 기술 및 버전 |
| --- | --- |
| 개발 환경 | Windows PowerShell, Node.js 24.13.0, npm 11.21.0 |
| UI와 상태 관리 | React 19.3.0, TypeScript 5.9.3, React Router 7.18.4, React Context 및 Hooks |
| 스타일과 빌드 | CSS Modules, Pretendard, Vite 8.3.1 |
| 테스트 | Node.js 기본 테스트 러너, Playwright 1.65.1 |
| 서버와 DB | Python 3.12 이상, FastAPI, Uvicorn, SQLAlchemy, PyMySQL, TiDB(MySQL 호환) |
| 메일 | 피드백 전송은 EmailJS Browser SDK 5.0.3, 비밀번호 재설정 인증번호 발송은 백엔드 Gmail API |

프론트엔드 패키지 버전은 잠금 파일 기준이며, 이 버전의 Vite가 지원하는 Node.js 범위는 `^20.19.0 || >=22.12.0`입니다. [package-lock.json](./package-lock.json)

### 프론트엔드 환경변수

`.env`의 기본 구성입니다. `VITE_API_BASE_URL`에는 서버의 기본 주소를 입력합니다. EmailJS 세 값은 피드백 메일을 보낼 때 함께 설정합니다. [.env.example](./.env.example) · [EmailJS 설정 안내](./docs/feedback-emailjs.md)

```dotenv
VITE_API_BASE_URL=https://fastapi-practice-jwse.onrender.com

# 피드백 메일을 보낼 때 설정하는 공개 식별자
VITE_EMAILJS_SERVICE_ID=
VITE_EMAILJS_TEMPLATE_ID=
VITE_EMAILJS_PUBLIC_KEY=
```

개발 중에는 Vite가 `/backend` 요청을 설정한 API 주소로 전달합니다. 배포 빌드는 API 서버를 직접 호출하므로 Render의 `FRONTEND_ORIGINS`에 `https://moeum-log.vercel.app`을 포함합니다. `VITE_`로 시작하는 값은 브라우저에 공개됩니다. DB 비밀번호, OAuth 비밀 키, Gmail 갱신 토큰은 백엔드에서 관리합니다.

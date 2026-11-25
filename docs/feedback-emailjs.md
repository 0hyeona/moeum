# MOEUM 피드백 설정

로그인 후 모든 공통 레이아웃에서 프로필 버튼 → **피드백 보내기**로 엽니다. 현재 MOEUM은 사이드바 대신 상단 헤더를 사용하므로, 데스크톱과 모바일 모두 프로필 메뉴의 계정 정보 바로 위에 배치했습니다. 다른 페이지와 외부 서비스 연동 코드는 변경하지 않습니다.

## 1. EmailJS 서비스와 템플릿

1. [EmailJS](https://dashboard.emailjs.com/)에서 관리자 메일을 보낼 Email Service를 연결하고 Service ID를 확인합니다.
2. 피드백 전용 Email Template을 만듭니다. **To Email에는 관리자 수신 이메일을 고정값으로 입력**합니다. 수신자 주소를 브라우저 변수로 지정하지 않습니다.
3. Subject를 다음 고정 문구로 설정합니다.

   ```text
   [MOEUM] 새로운 피드백이 도착했습니다.
   ```

4. 본문에 다음 변수를 넣습니다. 사용자 입력에는 일반 `{{변수}}`를 사용하고, HTML을 그대로 삽입하는 삼중 중괄호는 사용하지 않습니다.

   ```text
   피드백 유형: {{feedback_type}}

   상세 의견:
   {{feedback_message}}

   사용자 이메일: {{user_email}}
   작성 일시: {{submitted_at}}
   ```

   이메일 미입력 시 `미입력`, 작성 일시는 `Asia/Seoul` 기준 `(KST)`로 전달됩니다. 발신 이메일은 연결한 메일 서비스의 기본 발신자를 사용합니다. 선택 입력인 사용자 이메일을 필수 발신 주소로 설정하지 않습니다.

5. Template ID와 Account의 **Public Key**를 확인합니다.

## 2. Vite 환경변수

로컬 `.env.local`에 실제 값 세 개를 추가합니다. 기존 `VITE_API_BASE_URL`은 유지합니다.

```env
VITE_EMAILJS_SERVICE_ID=service_실제값
VITE_EMAILJS_TEMPLATE_ID=template_실제값
VITE_EMAILJS_PUBLIC_KEY=실제_Public_Key
```

`.env.example`에는 빈 항목만 있습니다. 세 값 중 하나라도 비어 있으면 전송 버튼을 비활성화하고 준비 중 안내를 표시하며, API 함수도 요청을 거부합니다. 환경변수 변경 후 개발 서버를 재시작합니다. 추후 승인된 배포에서는 Vercel에도 같은 값을 설정하고 새 빌드를 생성해야 합니다. Vite 환경변수는 빌드 시 포함됩니다.

`VITE_` 값은 브라우저에 공개됩니다. 위 세 값은 브라우저 SDK용 공개 식별자입니다. **EmailJS Private Key, 메일 비밀번호, SMTP 자격 증명은 추가하지 않습니다.** EmailJS 계정에서 비밀 키를 요구하는 서버 전용 설정을 켜면 이 프론트 전용 폼은 전송할 수 없습니다.

## 3. 횟수 제한과 스팸 방지

- 코드: SDK의 `blockHeadless: true`, `limitRate` 60초, 숨겨진 봇 감지 필드를 적용합니다. 전송 중 버튼·입력을 잠그고 동시에 들어온 요청을 한 번만 보냅니다.
- 요청을 시도한 뒤에는 성공·실패 모두 최대 60초 동안 재전송을 제한합니다. 실패한 입력은 유지하고 남은 대기 시간을 표시합니다. 저장소에는 요청 시각만 기록하고, 의견과 이메일은 저장하지 않습니다. 저장소를 사용할 수 없으면 같은 페이지 내 메모리 제한을 사용합니다.
- **EmailJS의 Domains 허용 목록에는 실제 서비스 출처를 등록**합니다. 예: `https://moeum-log.vercel.app`. 개발 테스트가 필요하면 `http://127.0.0.1:5173`처럼 실제 포트까지 등록합니다. 사용하지 않는 출처는 등록하지 않습니다.
- 클라이언트 제한은 조작하거나 우회할 수 있습니다. EmailJS의 서버 측 IP 요청 제한 및 계정 사용량도 함께 확인합니다. 관리자 수신자는 템플릿에 고정합니다.
- 더 강한 방어가 필요하면 EmailJS가 지원하는 reCAPTCHA V2 위젯과 토큰 전달을 추가해야 합니다. **현재 폼에는 CAPTCHA 위젯이 없으므로 템플릿에서 reCAPTCHA 필수 설정만 단독으로 켜지 않습니다.** 추가 시 비밀 키는 EmailJS 설정에서만 관리합니다.

공식 문서: [Browser SDK 설치](https://www.emailjs.com/docs/sdk/installation/), [SDK 옵션](https://www.emailjs.com/docs/sdk/options/), [도메인 허용 목록](https://www.emailjs.com/docs/faq/can-i-add-my-domain-to-allowlist/), [reCAPTCHA 설정](https://www.emailjs.com/docs/user-guide/adding-captcha-verification/).

## 4. 확인

```sh
node --test tests/feedback.test.mjs
npm test
npm run build
```

실제 메일을 보내지 않는 로컬 UI 검증 화면도 제공합니다.

```sh
# 설정 누락 상태
npm run preview:feedback
# 또는 설정된 상태의 성공·실패·지연 응답
FEEDBACK_PREVIEW_CONFIGURED=1 npm run preview:feedback
```

`http://127.0.0.1:5189/__feedback-preview`를 엽니다. 테스트 화면에서만 EmailJS 네트워크를 모의 응답으로 바꾸며, 실제 환경변수와 제품 진입 경로에는 영향을 주지 않습니다. 응답 선택과 대기 시간 초기화는 테스트 전용입니다.

- 프로필 메뉴에서 모달 진입, 필수 유형 단일 선택, 공백만 있는 의견 차단, 최대 500자, 선택 이메일 검증을 확인합니다.
- 전송 중 중복 클릭·닫기·Escape가 전송을 중복시키지 않는지 확인합니다.
- 실제 EmailJS가 HTTP 200으로 요청을 수락한 경우에만 완료 화면으로 전환합니다. 실패와 설정 누락을 성공으로 처리하지 않습니다.
- 실제 설정 후 관리자의 받은 편지함에서도 수신 여부를 확인합니다. SDK 요청 성공만으로 받은 편지함 도착까지 보장하지 않습니다.
- 데스크톱, 768px, 402px, 320px와 낮은 화면 높이에서 칩 줄바꿈·모달 내부 스크롤·닫기 버튼·하단 버튼을 확인합니다.

실제 서비스 설정과 관리자 수신 이메일은 저장소에 포함하지 않습니다. FastAPI와 DB 변경은 없습니다.

## 구현 파일 목록

- `src/api/feedback.ts`: EmailJS 호출, 입력 검증, 중복 전송 및 60초 제한, 한국 시간 작성 일시.
- `src/components/FeedbackModal.tsx`, `src/components/FeedbackModal.module.css`: 작성·로딩·실패·완료 화면, 키보드 및 반응형 모달.
- `src/components/AppLayout.tsx`: 공통 레이아웃에서 모달 관리.
- `src/components/ProfileMenu.tsx`, `src/components/ProfileMenu.module.css`: 계정 정보 위 피드백 메뉴.
- `.env.example`: 공개 설정값 세 개.
- `package.json`, `package-lock.json`: 공식 `@emailjs/browser` SDK 및 로컬 검증 명령.
- `README.md`, `docs/feedback-emailjs.md`: 기능 소개와 설정 안내.
- `tests/feedback.test.mjs`: 실제 SDK를 사용하고 네트워크만 모의 처리하는 전송 회귀 테스트.
- `tests/feedback-preview.mjs`: 실제 메일 없이 화면을 확인하는 로컬 전용 검증 서버.

## 이번 작업 검증 결과

- 전체 테스트 106개 통과, TypeScript 검사와 프로덕션 빌드 통과.
- 브라우저에서 필수 항목·단일 선택·선택 이메일 검증, 500자 제한, 성공 후 초기화, 실패 후 입력 유지 확인.
- 지연 전송 중 입력·버튼·Escape 잠금과 요청 횟수 1회 확인. 닫기 후 프로필 버튼 포커스와 배경 스크롤 복원 확인.
- 1280px, 768px, 402px, 320px 너비 확인. 402px 이하 좌우 여백 16px·내부 여백 16px·제목 16px·입력 14px 확인. 320×480에서 칩 줄바꿈과 내부 스크롤 확인.
- 미설정 상태에서는 필수 항목을 채워도 전송 버튼 비활성화·요청 0회 확인.
- 실제 EmailJS 계정 설정과 관리자 메일 수신은 아직 검증하지 않았습니다. GitHub Push와 Vercel 배포는 실행하지 않았습니다.

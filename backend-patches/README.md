# Story 자체 분석 복구

이 패치는 `fastapi-practice` 백엔드에 적용합니다. 프론트 저장소에서 실행하지 마세요.
백엔드 원본 폴더는 현재 작업창의 쓰기 허용 경로 밖이므로 원본과 Render 배포에는 아직 반영되지 않았습니다.

## 원인

프론트 커밋 `9182cff` 이전에는 `createAnalysis`가 선택한 기록을 브라우저에서 정리했습니다.
이후 `POST /stories/analyze` 응답을 기다리도록 바뀌었습니다. 기존 백엔드의
`app/services/story_analysis.py`는 `OPENAI_API_KEY`가 없으면 HTTP 503을 반환합니다.

## 변경

- OpenAI 요청·키 의존성을 제거하고 선택한 DB 기록을 기반으로 초안을 만듭니다.
- GitHub 커밋은 현재 연결 저장소와 SHA를 검증하고 실제 변경 파일과 diff를 조회합니다.
- 의미 중심(`semantic`), 균형(`balanced`), 코드 상세(`code`)에 맞춰 상세 수준을 조절합니다.
- diff에서 확인한 삭제·추가 코드 일부만 Before/After에 넣습니다. 알 수 없는 내용은 null입니다.
- Notion/Figma는 저장된 제목·설명을 정리합니다. 코드나 변경 의도를 만들어내지 않습니다.
- GitHub 한도·인증·조회 실패는 요약에 표시하고 저장된 기록으로 초안을 만듭니다.
- 커밋당 첫 100개 파일을 확인합니다. 일부만 확인했거나 diff가 없으면 명시합니다.
- 같은 저장소·인증의 커밋 상세는 프로세스 메모리에 5분간 캐시합니다. DB 변경은 없습니다.
- 기존 프로젝트 접근 검사와 선택한 활동 ID 검사를 유지합니다.
- 결과 응답의 title/summary/before/after/tags와 기존 Story 저장 API를 유지합니다.

## 적용

백엔드 저장소의 터미널에서 실행합니다. 첫 명령은 파일을 바꾸지 않고 적용 가능 여부만 확인합니다.

```powershell
git apply --check "C:\Users\ouskx\OneDrive\Desktop\hyeona\26\컴퓨터공학과_작품전시회\moeum\backend-patches\story-self-analysis.patch"
git apply "C:\Users\ouskx\OneDrive\Desktop\hyeona\26\컴퓨터공학과_작품전시회\moeum\backend-patches\story-self-analysis.patch"
.\.venv\Scripts\python.exe -m pytest tests/test_story_rules.py tests/test_project_content.py -q
```

기존 변경과 충돌하면 강제로 덮어쓰지 말고 충돌 파일을 확인하세요.
백엔드 검증 후 develop에 반영하고 Render 배포를 완료한 다음 프론트를 배포합니다.
프론트는 새 `mode` 필드를 보내므로 기존 백엔드와 함께 사용하면 422가 발생할 수 있습니다.

## 검증

- 자체 분석·GitHub diff·캐시·한도 오류·선택 검증·접근 제어·SQLite Story 저장/발행/재조회: 10개 통과.
- 프론트 빌드 통과. 분석 방식 매핑과 오류 전달을 포함한 프론트 테스트 통과.
- 패치를 백엔드 원본 파일에 적용하는 검사 및 수정본에서 역적용하는 검사 통과.
- FastAPI TestClient의 HTTP 테스트는 Windows 실행 환경의 socketpair 생성에서 멈춰 중단했습니다.
  실제 DB 접속, 실제 GitHub 응답, Render 배포 후 분석 성공은 아직 검증하지 않았습니다.

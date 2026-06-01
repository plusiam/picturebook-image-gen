<!-- 개발 중 내린 결정과 그 이유 (다음 세션 인수인계용) -->
# 맥락 노트 — picturebook-image-gen

## 아키텍처 결정 (2026-06-01)

### 왜 GAS인가 (Vercel·Supabase 제거)
- 사용자 Supabase 무료 티어 2개를 이미 소진 → 3번째 불가.
- "Vercel 꼭 안 써도 됨, GitHub로 배포" 요청.
- **GitHub Pages는 정적 전용 → 비밀 키 보관 불가.** 따라서 키를 들 서버가 필요.
- 결론: **GitHub Pages(프런트) + Google Apps Script(프록시·키·로깅)**.
  - 키 → Script Properties(`GEMINI_API_KEY`)
  - 로깅 → Google Sheets(교사가 직접 열람, Supabase 대시보드보다 친화적)
  - 캐릭터 기준 이미지 → (보강 예정) Google Drive. 현재 MVP는 세션 내 base64 보관.

### 모델
- `gemini-2.5-flash-image` 확정(사용자 지정). 3.x 계열 ID는 실재 미확인이라 제거.
- 공식 문서 확인(2026-06-01):
  - 엔드포인트: `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-image:generateContent`
  - 인증 헤더: `x-goog-api-key`
  - `generationConfig.responseModalities: ["TEXT","IMAGE"]` **필수**
  - 응답 이미지 추출: `candidates[0].content.parts[].inlineData.data` (base64)
  - 참조 이미지: `inline_data`(요청은 snake_case) 최대 ~10개 / 인물 4명
  - **무료 티어 이미지 출력 한도는 문서 미명시 → Phase 0에서 실측 필요.**

## 알아둘 함정 (advisor 검토 반영)

### 1. CORS — GAS의 가장 까다로운 부분
- GAS 웹앱은 응답 헤더(`Access-Control-Allow-Origin`)를 임의 설정 불가.
- 회피법: 프런트가 **단순 요청**으로 보냄 → `Content-Type: text/plain;charset=utf-8`, 커스텀 헤더 없음 → 브라우저 프리플라이트(OPTIONS) 생략.
- GAS는 `ContentService`로 JSON 반환. 최종 응답(`script.googleusercontent.com`)에 Google이 ACAO를 붙여줌.
- **부작용**: 응답 단계에서 출처를 `plusiam.github.io`로 제한 불가. → **출처 제한이 약함. 실제 방어는 반 코드 + 일일 캡.**
- Phase 0에서 빈 왕복부터 증명할 것.

### 2. 동시성 — 두 문제를 분리해야 함
- **문제 A (카운터 레이스)**: 일일 캡 증가 꼬임 → `LockService.getScriptLock()`로 **카운터 증가 구간만** 원자화. 해결됨.
- **문제 B (동시 실행 천장)**: GAS 스크립트당 동시 실행 상한(과거 ~30, 현재 수치 재확인). 웹앱은 배포 교사 1인 명의로 실행 → 25명 느린 생성이 한 천장에 쌓임. 버스트 시 "too many simultaneous invocations" 가능.
- **설계 규칙**: 느린 Gemini 호출은 **락 밖**. 락 안엔 짧은 카운터만. (코드 `Code.gs`에 반영)
- 한 학급은 교사 페이싱으로 자연 분산 → 보통 OK. 진짜 버스트 내성 필요 시 **Cloudflare Workers**로 프록시만 교체(프런트 유지).

### 3. 게이트 — KISS (과설계 금지)
- 세션 코드(교사가 수업 시작 때 교체, Script Properties) + **하드 일일 캡(진짜 방어선)** + 킬 스위치.
- 학생별 토큰·인증 금지(HANGI 과설계 경계).

### 4. 캐싱
- 캐시 키 = `프롬프트 + 참조이미지 해시 + 모델`. 재생성은 캐시 우회.

## 실호출 검증 시 주의 (advisor 검토 반영, 미검증 항목)
- **엔드포인트 버전**: 현재 `v1beta`로 설정. 이미지 출력이 안 되면 `v1`로 교체해 실측. (둘 다 시도)
- **responseFormat(화면비)**: 필드 형태 미검증이라 **기본 비활성**(`config.USE_ASPECT_RATIO=false`).
  첫 실호출은 `contents` + `responseModalities:["TEXT","IMAGE"]`만으로(최소 안전형) → 이미지 받으면 화면비 켜고 필드명 재확인.
  → 이 두 개가 틀리면 **실생성 100% 400 에러**. 교사 첫 실키 시도 전 반드시 확인.
- **쿼터 환불**: 생성 실패 시 `releaseQuota()`로 일일 캡 카운터 -1(실패가 학급을 조기 잠그지 않도록).
- **학생 편집 보존**: 페이지 프롬프트를 직접 수정하면 `_edited` 표시 → 공통 조건 변경 시 보존.
- **부적절어 오탐**: 안전 접미사 "비폭력"이 차단어 '폭력'과 부분일치하던 버그 수정(검사 전 접미사 제거). '피'·'죽'은 오탐 커서 BLOCKLIST에서 제외.

## DEMO로 검증된 것 / 안 된 것
- ✅ 검증(DEMO): 업로드→파싱→분석→렌더→캐시→게이트 UI→내보내기(ZIP/PDF 로드)→모바일 375px→편집 보존.
- ❌ 미검증(실키 필요): 실제 이미지 생성, 캐릭터 일관성, CORS 왕복, 무료 티어 가능 여부. → Phase 0 차단 3종.

## 미해결 / 다음 세션 할 일
- [ ] 실제 export JSON으로 `js/parse.js` 정규화 매핑 교체.
- [ ] GAS URL을 `js/config.js`에 입력 후 실키 end-to-end 테스트.
- [ ] 기준 이미지 Drive 저장 전환(현재 base64 round-trip → 크기 한계 있음).
- [ ] 동시 부하 실측 → 필요 시 Workers 전환 판단.

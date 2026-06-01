# 학생 그림책 작가 — 장면 이미지 생성기 개발 계획 (rev.2 · GAS)

> 스토리보드 도구의 JSON을 입력받아, 페이지·장면을 분석하고, 제미나이(Nano Banana)로 캐릭터 일관성을 유지한 삽화를 생성하는 **학생용 웹 도구 + 키 보호 프록시**.
>
> 작성: 2026-06-01 · 개정(rev.2): 2026-06-01 · 대상: Claude Code 작업
> 배포: **GitHub Pages(plusiam) + Google Apps Script 프록시** — *Vercel·Supabase 제거*

> ### rev.2 개정 요약
> - 모델 **`gemini-2.5-flash-image`로 확정**(3.x 계열 추정 ID 제거).
> - 프록시 **Vercel → Google Apps Script(GAS)** 로 교체.
> - 사용량 로깅 **Supabase → Google Sheets**, 기준 이미지 저장 **→ Google Drive**.
> - 동시성·게이트 설계 정밀화(§4·§7). CORS 회피(단순 요청) 명문화.

---

## 1. 목표와 범위

### 만들 것
- 학생이 스토리보드 도구(`picturebook-storyboard`)에서 내보낸 **JSON을 업로드** → 페이지/장면 자동 파싱
- 장면 텍스트에서 **배경·인물·행동·분위기**를 분석해 편집 가능한 **이미지 프롬프트**로 변환
- **캐릭터 일관성**: 주인공 기준 이미지를 참조로 투입해 모든 페이지에서 같은 모습 유지
- 제미나이 API로 **페이지별 삽화 생성** → 미리보기·재생성·전체 내보내기(ZIP/PDF)
- **API 키는 클라이언트에 절대 노출하지 않음** — GAS 프록시가 보관

### 안 만들 것 (이번 범위 밖)
- 스토리 작성 기능 (기존 스토리보드 도구가 담당)
- 인쇄·제본 자동화 (PDF 내보내기까지만)
- 학생 계정/로그인 시스템 (반 단위 세션 코드로 대체)

### 성공 기준
- 학생이 키 입력 없이 JSON만 올리면 페이지별 이미지를 받을 수 있다
- 같은 캐릭터가 페이지마다 일관되게 나온다
- 무료 티어 한도 안에서 한 학급(약 25명)이 운영 가능하다
- 교사가 생성량·접근을 통제할 수 있다

---

## 2. 아키텍처 (GAS 안)

```
[학생 브라우저]
  GitHub Pages 정적 웹앱 (plusiam.github.io/picturebook-image-gen)
      │  ① JSON 업로드·파싱·프롬프트 편집 (전부 클라이언트)
      │  ② POST text/plain (반 코드 + 프롬프트 + 참조이미지)   ← CORS 프리플라이트 회피
      ▼
[Google Apps Script 웹앱]  ← 프록시 (키 보관소)
      │  ③ 반 코드 검증 + 일일 캡 확인(LockService 원자적)
      │  ④ GEMINI_API_KEY(Script Properties) 주입해 제미나이 호출 (UrlFetchApp)
      ▼
[Google 제미나이 이미지 API]  (gemini-2.5-flash-image)
      │  ⑤ 이미지(base64) 반환
      ▼
[GAS] → 사용량 로깅(Google Sheets) → 학생 브라우저로 이미지 전달
[Google Drive] ← 캐릭터 기준 이미지 저장(보강 예정)
```

### 구성요소
| 계층 | 기술 | 역할 |
|---|---|---|
| 프런트엔드 | Vanilla HTML/CSS/JS (기존 plusiam 스택) | UI, JSON 파싱, 프롬프트 편집, 결과 갤러리 |
| 프록시 | **Google Apps Script 웹앱** | 키 보관, 제미나이 호출, 쿼터·접근 게이트 |
| 저장/계측 | **Google Sheets**(로그) + **Google Drive**(기준 이미지) | 일일·반별 사용량 카운터, 로그 |
| 이미지 모델 | `gemini-2.5-flash-image` (Nano Banana) | 삽화 생성 |

> **버스트 대안:** 한 학급을 넘는 동시 부하가 우려되면 프록시만 **Cloudflare Workers**(무료 10만 req/일, 진짜 CORS, D1 원자 카운터)로 교체. 프런트는 그대로. 자세한 비교는 §7.

---

## 3. 핵심 설계 결정

### 3.1 이미지 모델 (2026-06 기준)
- 모델 **`gemini-2.5-flash-image`** (Nano Banana) — 인물 다수·참조 이미지 일관성 지원, 고속.
- 공식 문서 확인(빌드 직전 재확인 권장: https://ai.google.dev/gemini-api/docs/image-generation)
  - 엔드포인트: `…/v1/models/gemini-2.5-flash-image:generateContent`
  - 인증: 헤더 `x-goog-api-key`
  - `generationConfig.responseModalities: ["TEXT","IMAGE"]` **필수**
  - 응답 추출: `candidates[0].content.parts[].inlineData.data`(base64)
- 생성물에는 **SynthID 워터마크** 포함 → UI·내보내기 안내문에 명시.
- ⚠️ **무료 티어 이미지 출력 한도는 문서 미명시 → Phase 0에서 교사 키로 실측.**

### 3.2 캐릭터 일관성 전략 (이 프로젝트의 중심)
1. **캐릭터 정의**: JSON에서 등장인물 추출(없으면 수동 추가)
2. **기준 이미지 확보**: 주인공별로 (a) 모델로 1장 생성 후 채택, 또는 (b) 학생이 직접 그린 그림 업로드
3. **참조 투입**: 페이지 생성 시 `[기준 이미지(들)] + [장면 프롬프트]`를 함께 전달 → 동일 외형 유지
4. (선택) **스타일 앵커**: 직전 페이지 이미지를 추가 참조로 넣어 화풍 통일

> 아동 사진을 참조로 올리지 않도록 UI에서 안내(개인정보·초상 보호). 기준 이미지는 **그림/생성 이미지**만 권장.

### 3.3 키 보호 & 무료 티어 보호 (가장 중요)
- `GEMINI_API_KEY`는 **GAS Script Properties에만** 존재. 프런트·네트워크 응답 어디에도 노출 금지.
- 프록시 엔드포인트는 공개 URL이므로 반드시 게이트:
  - **반 세션 코드**(서버 검증, 수업마다 교체) — 학생 친화적
  - **일일 총량 캡**(예: 400장/일, LockService 원자 증가) — *진짜 방어선*
  - **킬 스위치**(`KILL_SWITCH=true`면 전체 차단)
- ⚠️ GAS는 응답 CORS 출처 제한이 약함(§7.1) → **출처 화이트리스트에 의존하지 말고 코드+캡을 1차 방어로**.

---

## 4. 데이터 모델

### 4.1 Phase 0에서 확정 (현재 미확정)
스토리보드 도구의 **실제 내보내기 JSON 1개**를 받아 필드 구조를 확정한다. 확정 전까지 아래 *예상* 스키마를 가정하되, 파서는 방어적으로 작성한다.

```jsonc
// ※ 예상 스키마 — 실제 export 파일로 교체 필요 (Phase 0). samples/sample-story.json 참고
{
  "title": "용감한 토끼",
  "author": "3학년 김OO",
  "pages": [
    {
      "index": 1,
      "text": "토끼가 깜깜한 숲으로 들어갔어요.",
      "scene": "밤의 숲",
      "characters": ["토끼"],
      "note": "무서운 분위기"
    }
  ]
}
```

### 4.2 내부 정규화 모델 (스키마 안정화 계층)
입력 JSON이 어떤 형태든 아래 **canonical 모델**로 변환한다. 이후 모든 로직은 이 모델만 의존.

```ts
interface NormalizedPage {
  index: number;          // 페이지 순서
  narration: string;      // 본문 텍스트
  setting: string;        // 배경/장소
  characters: string[];   // 이 페이지 등장인물 키
  action: string;         // 핵심 행동
  mood: string;           // 분위기/감정
  rawPrompt: string;      // 자동 생성된 초기 프롬프트
  userPrompt: string;     // 학생이 편집한 최종 프롬프트
}
interface CharacterRef {
  key: string;            // "토끼"
  description: string;    // 외형 설명
  refImageBase64?: string;// 기준 이미지 (일관성용)
}
```

---

## 5. 이미지 생성 파이프라인

```
JSON 업로드 → 정규화(NormalizedPage[]) → 캐릭터 시트 확정(CharacterRef[])
  → 페이지별 프롬프트 자동 생성(편집 가능) → 공통 조건 적용(그림체·화면비·색감·톤)
  → 프록시로 생성 요청(프롬프트 + 캐릭터 참조) → 미리보기 → 페이지별 재생성
  → 전체 내보내기(ZIP / PDF)
```

### 프롬프트 조립 규칙
```
[그림체] + [배경/setting] + [캐릭터(참조 이미지 동봉)] + [행동/action]
+ [분위기/mood] + [구도] + [화면비] + "어린이 그림책 삽화, 연령 적합, 따뜻한"
```
- 모든 프롬프트에 **연령 적합·비폭력·안전** 가드 문구 자동 삽입.

---

## 6. 프록시 설계 (Google Apps Script)

**계약(Contract)** — *CORS 프리플라이트 회피를 위해 text/plain 단순 요청*
```
POST {GAS_WEBAPP_URL}     Content-Type: text/plain;charset=utf-8
Request  : { action:"generate", classCode, prompt, model?, aspectRatio?, refImages?: string[] }
Response : { ok:true, imageBase64, model } | { ok:false, error, code }
헬스체크 : { action:"health" } → { ok:true }
```

**서버 책임 (`gas/Code.gs`)**
- `classCode` 검증(불일치 403)
- 킬 스위치 확인
- **일일 캡 확인·증가 — LockService로 카운터 구간만 원자화** (느린 Gemini 호출은 락 밖)
- `GEMINI_API_KEY`(Script Properties) 주입 후 `UrlFetchApp`로 제미나이 호출
- Google Sheets에 사용량 로깅
- 결과 base64 추출 → 반환

> **GAS 한계**: 6분 실행 제한(단일 이미지 호출은 무관), UrlFetch 일일 쿼터(학급 규모엔 충분), **동시 실행 천장**(§7.2). 응답 CORS 출처 제한 약함(§7.1).

---

## 7. 동시성 · 게이트 · CORS (협의 반영)

### 7.1 CORS (가장 까다로운 의존성)
- GAS 웹앱은 응답 헤더 임의 설정 불가 → 프런트가 **단순 요청**(`text/plain`, 커스텀 헤더 없음)으로 프리플라이트 회피.
- 최종 응답에 Google이 ACAO를 자동 부여하므로 호출은 동작하나 **출처를 plusiam으로 제한 불가**.
- ∴ **출처 화이트리스트에 의존 금지. 반 코드 + 일일 캡이 실제 방어.**
- **Phase 0**: `plusiam.github.io → GAS → 응답` 빈 왕복(`action:"health"`)부터 증명.

### 7.2 동시성 (학급 25명) — 두 문제 분리
| 문제 | 증상 | 대응 |
|---|---|---|
| A. 카운터 레이스 | 일일 캡 증가 꼬임 → 한도 초과 통과 | `LockService.getScriptLock()`로 **증가 구간만** 원자화 ✅ |
| B. 동시 실행 천장 | 25명 동시 클릭 시 "too many simultaneous invocations" | 느린 호출은 락 밖 + **교사 페이싱**으로 분산. 버스트 우려 시 Workers |

- **규칙**: 느린 Gemini 호출은 절대 락 안에 넣지 않는다(직렬화되면 마지막 학생이 수 분 대기).
- 한 학급은 교사 진행으로 자연 분산 → 보통 충분. **"LockService가 동시성 전부를 푼다"는 오해 금지**(A만 해결).

### 7.3 게이트 (KISS — 과설계 금지)
1. **세션 코드** — 교사가 수업 시작 때 교체(Script Properties)
2. **하드 일일 캡** — *진짜 방어선*. 코드 유출돼도 하루 손실은 캡까지.
3. **킬 스위치**
> 학생별 토큰·인증은 만들지 않는다(불필요한 복잡성).

### 7.4 GAS vs Cloudflare Workers
| | GAS (1순위) | Cloudflare Workers (버스트 대안) |
|---|---|---|
| 학습 비용 | 없음(이미 Google) | 새 플랫폼 |
| 동시 버스트 | 약함(교사 페이싱 전제) | 강함(await가 CPU시간 미차감) |
| 로깅 | Sheets(교사 직접 열람) | D1/KV |
| 권고 | **1학급 운영 1순위** | 여러 반 동시·버스트 시 |

---

## 8. 안전 · 연령 적합성 (초등 대상)
- 모든 호출은 **교사 키 → 프록시** 경유 → 학생이 자기 구글 계정을 쓰지 않음. 단, **교사 매개·검수 전제**.
- 프롬프트에 연령 적합·비폭력 가드 자동 삽입, 부적절어 입력 필터.
- **교사 검수 모드**: 생성 이미지를 '채택' 전까지 임시 상태로 두고 교사가 승인.
- 아동 실물 사진 업로드 금지 안내(그림/생성 이미지만 참조).
- SynthID 워터마크·AI 생성물 표기 안내.

---

## 9. 저장소 구조
```
picturebook-image-gen/
├─ index.html            # 학생용 단일 화면 앱
├─ css/style.css
├─ js/
│  ├─ config.js          # GAS URL·기본값(여기만 고치면 됨)
│  ├─ parse.js           # JSON 업로드·정규화(canonical)
│  ├─ analyze.js         # 장면→프롬프트 분석/조립·안전 가드
│  ├─ characters.js      # 캐릭터 시트·참조 이미지 관리
│  ├─ generate.js        # 프록시 호출·재시도·캐시·DEMO
│  ├─ gallery.js         # 미리보기·재생성·검수 채택
│  ├─ export.js          # ZIP/PDF 내보내기
│  └─ app.js             # 상태·이벤트 배선(오케스트레이터)
├─ gas/
│  └─ Code.gs            # Google Apps Script 프록시(붙여넣기용)
├─ samples/sample-story.json
├─ CLAUDE.md             # 프로젝트 규약
└─ README.md
```
> 프록시(GAS)는 코드형이라 repo 분리 불필요. `gas/Code.gs`를 Apps Script 편집기에 붙여넣어 배포.

---

## 10. 개발 단계 (마일스톤)
| Phase | 내용 | 완료 조건(DoD) |
|---|---|---|
| **0. 기반** | 실제 JSON 스키마 · repo · GAS 배포 · health 왕복 · 무료티어 실측 | health 200 + 이미지 1장 무료 확인 |
| **1. 파싱** | 업로드·정규화·페이지 목록 UI | 샘플 JSON이 페이지 카드로 표시 ✅ |
| **2. 단일 생성** | 프록시 경유 text→image 1장 | 프롬프트 입력 → 이미지 1장 ✅(DEMO) / 실키 대기 |
| **3. 일관성** | 캐릭터 시트·기준 이미지·참조 투입 | 같은 캐릭터 2페이지 동일 외형 |
| **4. 자동 분석** | 장면→프롬프트 자동 생성·공통 조건 | 프롬프트 자동 채움+수정 ✅ |
| **5. 배치·캐시** | 전체 생성·진행률·재생성·캐싱 | 일괄 생성·개별 재생성 ✅ |
| **6. 쿼터·게이트** | 반 코드·일일 캡·Sheets 로깅·킬스위치 | 코드 없으면 403, 한도 차단 ✅ |
| **7. 내보내기·마감** | ZIP/PDF·갤러리·UI | 완성본 다운로드 ✅ |
| **8. 안전·운영** | 검수 모드·가드·워터마크·필터 | 교사 승인 흐름·안내문 ✅ |

> MVP 경계: **Phase 0~3**. 프런트엔드는 1~8 골격 구현 완료, 실키 검증(0·2·3 일부)만 사용자 몫.

---

## 11. 환경변수 / 시크릿 (GAS Script Properties)
| 키 | 설명 |
|---|---|
| `GEMINI_API_KEY` | 제미나이 API 키(교사) |
| `CLASS_CODE` | 반 세션 코드(수업마다 교체) |
| `DAILY_CAP` | 일일 생성 총량(예: 400) |
| `KILL_SWITCH` | `true`면 전체 차단 |
| `LOG_SHEET_ID` | (선택) 로깅용 Google Sheets ID |

---

## 12. 미해결 결정사항 (착수 전 확정)
- [ ] **실제 export JSON 1개 제공** → 스키마 확정(Phase 0 차단 요소)
- [ ] `gemini-2.5-flash-image` 이미지 출력 무료 티어 가능 여부 실측
- [ ] 캐릭터 기준 이미지: 모델 생성 / 학생 그림 업로드 / 둘 다
- [ ] 일일 캡 수치(학급 규모 기준)
- [ ] 기준 이미지 Drive 저장 전환 시점

## 부록 · 참고 링크
- 제미나이 이미지 생성: https://ai.google.dev/gemini-api/docs/image-generation
- GAS 웹앱: https://developers.google.com/apps-script/guides/web

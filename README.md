# 🎨 그림책 이미지 생성기 (picturebook-image-gen)

스토리보드 도구에서 내보낸 **JSON**을 올리면, 장면을 분석해 **이미지 프롬프트**로 바꾸고, 제미나이(`gemini-2.5-flash-image`)로 **캐릭터가 일관된 그림책 삽화**를 만들어 주는 학생용 웹 도구입니다.

- **학년·교과**: 초등 3~6학년 · 국어/창의적 체험활동(그림책 작가 프로젝트)
- **사용 시나리오**: 학생이 QR로 접속 → JSON 업로드 → 캐릭터 기준 이미지 지정 → 페이지별 생성 → ZIP/PDF 저장
- **직접 체험**: https://plusiam.github.io/picturebook-image-gen/ (DEMO 모드로 즉시 체험 가능)
- **라이선스**: MIT

## 특징
- 🔑 **API 키 무노출** — 키는 Google Apps Script(교사)만 보관, 학생 브라우저엔 절대 안 나감
- 🧸 **캐릭터 일관성** — 주인공 기준 이미지를 참조로 투입해 모든 페이지 같은 모습
- 🛡 **안전 우선** — 연령 적합 가드 자동 삽입·부적절어 필터·교사 검수 채택·아동 사진 금지 안내
- 📄 **내보내기** — ZIP / PDF

## 구조
```
index.html · css/style.css · js/*.js   ← GitHub Pages(정적)
gas/Code.gs                            ← Google Apps Script 프록시(키 보관·게이트·로깅)
samples/sample-story.json              ← 체험용 샘플
```

## 설치·배포 (교사용)

### 1) 프런트 — GitHub Pages
1. 이 폴더를 `plusiam/picturebook-image-gen` 저장소로 푸시
2. Settings → Pages → Source: `main` / `(root)`

### 2) 프록시 — Google Apps Script
1. https://script.google.com 새 프로젝트 → `gas/Code.gs` 내용 붙여넣기
2. 프로젝트 설정 → **스크립트 속성** 등록
   | 키 | 예시 |
   |---|---|
   | `GEMINI_API_KEY` | 교사 제미나이 키 |
   | `CLASS_CODE` | `토끼반0601` (수업마다 교체) |
   | `DAILY_CAP` | `400` |
   | `KILL_SWITCH` | `false` |
   | `LOG_SHEET_ID` | (선택) 로그용 구글 시트 ID |
3. **배포 → 새 배포 → 웹앱** / 실행: 나 / 액세스: 모든 사용자
4. 발급된 `/exec` URL을 `js/config.js`의 `GAS_URL`에 입력 → 커밋

> `GAS_URL`이 비어 있으면 자동으로 **DEMO 모드**(가짜 이미지)로 동작합니다.

## 로컬 실행
```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```
> 모바일(375px)·A4 인쇄 미리보기에서 깨지지 않는지 확인하세요. 콘솔 에러가 없어야 합니다.

## ⚠️ 운영 주의
- `gemini-2.5-flash-image` **이미지 출력이 무료 티어로 되는지** 교사 키로 먼저 확인하세요(과금 가능성).
- 한 학급 동시 사용은 **교사 진행에 맞춰 분산**하세요(GAS 동시 실행 한계). 버스트가 잦으면 프록시를 Cloudflare Workers로 교체 가능.
- 생성물에는 **SynthID 워터마크**가 포함됩니다.

<!-- 학생 그림책 이미지 생성기 — Phase별 작업 체크리스트 -->
# 체크리스트 — picturebook-image-gen

## Phase 0. 기반 (착수 차단 요소)
- [x] 실제 스토리보드 export JSON(schemaVersion 2) 확보 → **스키마 확정** (parse.js 실파일 검증 완료)
- [ ] 교사 키로 `gemini-2.5-flash-image` 이미지 출력이 **무료 티어로 되는지** 확인 (과금 시 가성비 재검토)
- [ ] GAS 웹앱 배포 → `https://plusiam.github.io` → GAS CORS 왕복(text/plain 단순 요청) 증명
- [x] repo 골격 (index/css/js/gas/samples)
- [x] 환경 규약 문서(CLAUDE.md), README

## Phase 1. 파싱
- [x] JSON 업로드·정규화(canonical `NormalizedPage[]`)
- [x] 페이지 카드 목록 UI
- [x] 샘플 JSON이 페이지 카드로 표시

## Phase 2. 단일 생성
- [x] GAS 프록시 경유 text→image 1장 (계약: POST text/plain)
- [x] DEMO 모드(키 없이 파이프라인 검증용 플레이스홀더 이미지)
- [ ] 실제 키로 프롬프트 입력 → 이미지 1장 표시 (사용자 키 필요)

## Phase 3. 일관성
- [x] 캐릭터 시트 UI·기준 이미지 업로드·참조 투입
- [ ] 같은 캐릭터가 2페이지에서 동일 외형 (실제 키로 검증)
- [ ] (보강) 기준 이미지 Google Drive 저장 → ID 참조 (현재는 base64 세션 보관)

## Phase 4. 자동 분석
- [x] 장면→프롬프트 자동 생성·편집 카드
- [x] 공통 조건 패널(그림체·화면비·색감·톤)
- [x] 연령 적합·안전 가드 문구 자동 삽입

## Phase 5. 배치·캐시
- [x] 전체 생성·진행률
- [x] 페이지별 재생성
- [x] 동일 입력(프롬프트+참조해시+모델) 캐싱, 재생성은 캐시 우회

## Phase 6. 쿼터·게이트 (GAS 측)
- [x] 반 세션 코드 검증(불일치 403)
- [x] 일일 총량 캡(LockService 원자적 증가) — **진짜 방어선**
- [x] 킬 스위치
- [x] Google Sheets 사용량 로깅
- [ ] 한 학급 동시 부하 실측(동시 실행 천장 관찰) → 필요 시 Cloudflare Workers 전환

## Phase 7. 내보내기·마감
- [x] ZIP 내보내기(JSZip)
- [x] PDF 내보내기(jsPDF)
- [x] 갤러리·학생 UI 다듬기

## Phase 8. 안전·운영
- [x] 교사 검수 모드(채택 전 임시 상태)
- [x] 부적절어 입력 필터
- [x] SynthID·AI 생성물 안내문
- [x] 아동 실물 사진 업로드 금지 안내

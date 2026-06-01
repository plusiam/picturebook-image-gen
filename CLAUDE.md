# 프로젝트 규약 — picturebook-image-gen

- 모든 코드 주석·커밋 메시지는 **한글**로 작성한다.
- 프런트엔드는 프레임워크 없이 **Vanilla HTML/CSS/JS**로 유지(기존 plusiam 스택).
- API 키(`GEMINI_API_KEY`)는 절대 프런트엔드/커밋/로그에 넣지 않는다. **GAS Script Properties 전용**.
- 외부 호출은 반드시 **GAS 프록시 경유**. 프런트에서 `generativelanguage`를 직접 호출 금지.
- 프런트→GAS 호출은 **`Content-Type: text/plain`** 단순 요청으로(프리플라이트 회피).
- 제미나이 요청/응답 필드는 공식 문서로 확인 후 구현(자주 바뀜).
- 모델 기본값: **`gemini-2.5-flash-image`**.
- 배포: 프런트 → **GitHub Pages(plusiam)**, 프록시 → **Google Apps Script 웹앱**.
- 경로는 상대 경로(`./js/...`) 사용 — GitHub Pages 하위 경로 배포 대비.
- 2022 개정 교육과정·초등(아동) 맥락. 연령 적합·안전 가드 기본 적용.
- 동시성: 일일 캡 카운터는 LockService로 **카운터 구간만** 원자화. 느린 Gemini 호출은 락 밖.
- 게이트는 KISS: 반 코드 + 일일 캡 + 킬 스위치. 학생별 인증 만들지 않는다.
- 커밋은 작업 단위로(Phase별 권장).

## 새 파일 첫 줄 한글 헤더 주석 필수
- HTML `<!-- 역할 -->`, JS `// 역할`, CSS `/* 역할 */`

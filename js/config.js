// 앱 설정 — GAS 배포 후 여기 GAS_URL만 채우면 됩니다
window.APP_CONFIG = {
  // GAS 웹앱 /exec URL (배포 후 입력). 비어 있으면 자동으로 DEMO 모드.
  GAS_URL: '',

  // DEMO 모드: 키 없이 파이프라인을 검증하기 위한 플레이스홀더 이미지 생성
  // GAS_URL이 비어 있으면 강제로 true가 됩니다(app.js에서 처리).
  DEMO: true,

  MODEL_DEFAULT: 'gemini-2.5-flash-image',

  // 화면비 전달 여부. 기본 false — 첫 실호출은 최소 안전 형태(텍스트+이미지만)로 검증하기 위함.
  // 실호출이 이미지를 정상 반환하면 true로 켜고 responseFormat 필드명을 공식 문서로 재확인할 것.
  USE_ASPECT_RATIO: false,

  // 공통 조건 기본값
  DEFAULTS: {
    style: '부드러운 수채화 동화 그림체',
    aspectRatio: '4:3',
    palette: '따뜻한 파스텔',
    tone: '밝고 다정한'
  },

  // 안전 가드 — 모든 프롬프트에 자동 삽입
  SAFETY_SUFFIX: '어린이 그림책 삽화, 연령 적합, 비폭력, 따뜻하고 안전한 분위기',

  // 부적절어 간단 필터(초등 맥락). 실제 운영 시 보강 권장.
  // '피'·'죽'은 일상어(커피·죽순 등) 오탐이 커서 제외. 실제 안전망은 교사 검수.
  BLOCKLIST: ['칼', '총', '폭력', '무기', '때리'],

  // 페이지당 재생성 제한
  MAX_REGEN_PER_PAGE: 5
};

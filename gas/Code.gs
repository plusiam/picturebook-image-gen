// 그림책 이미지 생성기 키 보호 프록시 — Apps Script 편집기에 붙여넣어 웹앱으로 배포
//
// ── 배포 방법 ──────────────────────────────────────────────
// 1) script.google.com 에서 새 프로젝트 → 이 파일 내용 붙여넣기
// 2) 프로젝트 설정 → 스크립트 속성에 아래 키 등록
//    GEMINI_API_KEY = 교사 제미나이 키
//    CLASS_CODE     = 수업용 반 코드(수업마다 교체)
//    DAILY_CAP      = 400            (하루 총 생성 상한)
//    KILL_SWITCH    = false          (true면 전체 차단)
//    LOG_SHEET_ID   = (선택) 로깅용 구글 시트 ID
// 3) 배포 → 새 배포 → 유형: 웹앱
//    실행 주체: 나(교사) / 액세스: 모든 사용자
// 4) 발급된 /exec URL을 js/config.js 의 GAS_URL 에 입력
// ───────────────────────────────────────────────────────────
//
// ※ CORS: 프런트는 text/plain 단순 요청으로 호출(프리플라이트 회피).
//   GAS는 응답 헤더를 임의 지정 못 하므로 출처 제한은 약함 → 실제 방어는 반 코드 + 일일 캡.

const MODEL_DEFAULT = 'gemini-2.5-flash-image';

// 웹앱 진입점. 프런트가 보낸 JSON(text/plain 본문)을 처리한다.
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action || 'generate';

    if (action === 'health') return json({ ok: true });           // Phase 0 왕복 확인용
    if (action === 'generate') return handleGenerate(body);
    return json({ ok: false, error: '알 수 없는 action', code: 'BAD_ACTION' });
  } catch (err) {
    return json({ ok: false, error: String(err), code: 'SERVER_ERROR' });
  }
}

// GET은 헬스체크만(브라우저에서 URL 직접 확인용)
function doGet() {
  return json({ ok: true, note: '그림책 이미지 프록시 동작 중' });
}

// 이미지 생성 처리: 게이트 → (락)카운터 증가 → 제미나이 호출 → 로깅
function handleGenerate(body) {
  const props = PropertiesService.getScriptProperties();

  // 1) 킬 스위치
  if (String(props.getProperty('KILL_SWITCH')) === 'true') {
    return json({ ok: false, error: '관리자가 일시 중지함', code: 'KILL_SWITCH' });
  }

  // 2) 반 코드 검증
  const expected = props.getProperty('CLASS_CODE') || '';
  if (!body.classCode || body.classCode !== expected) {
    return json({ ok: false, error: '반 코드가 올바르지 않습니다', code: 'FORBIDDEN' });
  }

  // 3) 일일 캡 확인·증가 — 짧은 카운터 구간만 락(느린 호출은 락 밖)
  const cap = parseInt(props.getProperty('DAILY_CAP') || '400', 10);
  const capResult = reserveQuota(cap);
  if (!capResult.ok) {
    return json({ ok: false, error: '오늘 생성 한도를 초과했습니다', code: 'QUOTA_EXCEEDED' });
  }

  // 4) 제미나이 호출 (락 밖에서 실행 — 수~수십 초 걸림)
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) return json({ ok: false, error: '서버 키 미설정', code: 'NO_KEY' });

  const model = body.model || MODEL_DEFAULT;
  try {
    const imageBase64 = callGemini(apiKey, model, body.prompt, body.refImages, body.aspectRatio);
    logUsage(props, { model: model, status: 'ok', code: body.classCode });
    return json({ ok: true, imageBase64: imageBase64, model: model });
  } catch (err) {
    // 이미지를 못 받았으면 쿼터를 환불(실패가 일일 캡을 깎아 학급을 조기에 잠그지 않도록)
    releaseQuota();
    logUsage(props, { model: model, status: 'error', code: body.classCode, msg: String(err) });
    return json({ ok: false, error: String(err), code: 'GEMINI_ERROR' });
  }
}

// 일일 캡 카운터를 원자적으로 +1 (락은 이 짧은 구간에만)
function reserveQuota(cap) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // 최대 10초 대기
  try {
    const props = PropertiesService.getScriptProperties();
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const key = 'COUNT_' + today;
    const used = parseInt(props.getProperty(key) || '0', 10);
    if (used >= cap) return { ok: false, used: used };
    props.setProperty(key, String(used + 1));
    return { ok: true, used: used + 1 };
  } finally {
    lock.releaseLock();
  }
}

// 일일 캡 카운터를 원자적으로 -1 (생성 실패 환불용)
function releaseQuota() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const key = 'COUNT_' + today;
    const used = parseInt(props.getProperty(key) || '0', 10);
    if (used > 0) props.setProperty(key, String(used - 1));
  } finally {
    lock.releaseLock();
  }
}

// 제미나이 generateContent 호출 → 응답에서 이미지 base64 추출
// ※ 엔드포인트 버전 주의: 이미지 출력이 v1에서 안 되면 v1beta로 교체해 실측할 것(Phase 0).
function callGemini(apiKey, model, prompt, refImages, aspectRatio) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

  // contents.parts: [텍스트] + [참조 이미지들(inline_data)]
  const parts = [{ text: prompt || '' }];
  (refImages || []).forEach(function (b64) {
    parts.push({ inline_data: { mime_type: 'image/png', data: stripDataUrl(b64) } });
  });

  const payload = {
    contents: [{ parts: parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  };
  if (aspectRatio) {
    // ※ 필드 경로는 공식 문서로 재확인 권장(자주 바뀜)
    payload.generationConfig.responseFormat = { image: { aspectRatio: aspectRatio } };
  }

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const data = JSON.parse(res.getContentText() || '{}');
  if (code !== 200) {
    throw new Error('제미나이 ' + code + ': ' + (data.error && data.error.message || ''));
  }

  // 응답에서 첫 이미지 part 추출 (camelCase inlineData)
  const cands = data.candidates || [];
  for (let i = 0; i < cands.length; i++) {
    const ps = (cands[i].content && cands[i].content.parts) || [];
    for (let j = 0; j < ps.length; j++) {
      const inline = ps[j].inlineData || ps[j].inline_data;
      if (inline && inline.data) return inline.data;
    }
  }
  throw new Error('응답에 이미지가 없습니다');
}

// 사용량을 구글 시트에 기록(LOG_SHEET_ID 설정 시에만)
function logUsage(props, info) {
  try {
    const sheetId = props.getProperty('LOG_SHEET_ID');
    if (!sheetId) return;
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    sheet.appendRow([new Date(), info.code, info.model, info.status, info.msg || '']);
  } catch (err) {
    // 로깅 실패는 본 기능을 막지 않는다
  }
}

// "data:image/png;base64,..." 접두어가 있으면 제거
function stripDataUrl(b64) {
  const i = String(b64).indexOf('base64,');
  return i >= 0 ? String(b64).slice(i + 7) : b64;
}

// JSON 응답 헬퍼
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

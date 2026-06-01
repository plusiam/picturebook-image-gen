// JSON 업로드·정규화 — 어떤 입력이든 canonical NormalizedPage[] 로 변환(스키마 안정화 계층)

// 여러 키 후보 중 처음 발견되는 값을 반환(방어적 파싱)
function pick(obj, keys, fallback) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return fallback;
}

// 등장인물을 문자열 배열로 정규화(문자열/배열/객체 혼재 대응)
function normCharacters(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(c => (typeof c === 'string' ? c : pick(c, ['key', 'name', 'id'], ''))).filter(Boolean);
  }
  if (typeof raw === 'string') return raw.split(/[,/·]/).map(s => s.trim()).filter(Boolean);
  return [];
}

// 본문 첫 문장 추출(주인공 설명 시드용)
function firstSentence(text) {
  const s = String(text || '').split(/(?<=[.!?。])\s|\n/)[0] || '';
  return s.length > 80 ? s.slice(0, 80) : s;
}

// 입력 JSON → { title, author, protagonist, protagonistHint, pages: NormalizedPage[] }
// 스토리보드 schemaVersion 2 및 일반 형태를 모두 방어적으로 처리한다.
function normalizeStory(input) {
  if (!input || typeof input !== 'object') throw new Error('JSON 형식이 아닙니다.');

  // pages 배열 위치 후보: pages / scenes / data / 최상위 배열 (totalPages는 신뢰하지 않고 배열 길이 사용)
  let rawPages = pick(input, ['pages', 'scenes', 'data', 'items'], null);
  if (!rawPages && Array.isArray(input)) rawPages = input;
  if (!Array.isArray(rawPages)) throw new Error('페이지 배열을 찾을 수 없습니다(pages/scenes).');

  const student = (input.student && typeof input.student === 'object') ? input.student : {};
  const authorObj = (input.author && typeof input.author === 'object') ? input.author : {};
  const protagonist = String(pick(student, ['protagonist'], '') || pick(input, ['protagonist'], ''));

  let coverHint = ''; // 표지 본문 첫 문장(주인공 설명 시드)

  const pages = rawPages.map((p, i) => {
    const narration = String(pick(p, ['text', 'narration', 'content', 'body', 'sentence'], ''));
    const setting = String(pick(p, ['scene', 'setting', 'background', 'place'], ''));
    const note = String(pick(p, ['note', 'mood', 'memo', 'direction'], ''));
    const type = String(pick(p, ['type'], ''));
    // 등장인물: 명시 배열 우선, 없으면 주인공을 기본 투입(페이지마다 일관성 유지)
    let chars = normCharacters(pick(p, ['characters', 'people', 'actors'], []));
    if (!chars.length && protagonist) chars = [protagonist];
    // 학생이 직접 그린 그림(base64 dataURL만 인정, "null" 문자열 등 배제)
    const drawing = pick(p, ['drawing', 'image', 'sketch'], '');
    const studentDrawing = (typeof drawing === 'string' && drawing.indexOf('data:') === 0) ? drawing : '';

    if (type === 'cover' && narration) coverHint = firstSentence(narration);

    return {
      index: parseInt(pick(p, ['index', 'page', 'no', 'order'], i + 1), 10) || i + 1,
      narration: narration,
      setting: setting,
      characters: chars,
      type: type,
      label: String(pick(p, ['label'], '')),
      studentDrawing: studentDrawing,
      action: '',           // analyze 단계에서 채움
      mood: note,
      rawPrompt: '',         // analyze 단계에서 채움
      userPrompt: ''         // 학생이 편집한 최종값
    };
  }).sort((a, b) => a.index - b.index);

  return {
    title: String(pick(student, ['title'], '') || pick(input, ['title', 'name'], '제목 없음')),
    author: String(pick(student, ['name'], '') || authorObj.name || (typeof input.author === 'string' ? input.author : '') || ''),
    protagonist: protagonist,
    protagonistHint: coverHint,  // 주인공 설명 기본값(표지 본문 첫 문장)
    pages: pages
  };
}

// 파일(File 객체)을 읽어 정규화된 스토리 반환
function readStoryFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(normalizeStory(JSON.parse(reader.result)));
      } catch (err) {
        reject(new Error('JSON 파싱 실패: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsText(file, 'utf-8');
  });
}

window.Parse = { normalizeStory, readStoryFile };

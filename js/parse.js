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

// 입력 JSON → { title, author, pages: NormalizedPage[] }
function normalizeStory(input) {
  if (!input || typeof input !== 'object') throw new Error('JSON 형식이 아닙니다.');

  // pages 배열 위치 후보: pages / scenes / data / 최상위 배열
  let rawPages = pick(input, ['pages', 'scenes', 'data', 'items'], null);
  if (!rawPages && Array.isArray(input)) rawPages = input;
  if (!Array.isArray(rawPages)) throw new Error('페이지 배열을 찾을 수 없습니다(pages/scenes).');

  const pages = rawPages.map((p, i) => {
    const narration = String(pick(p, ['text', 'narration', 'content', 'body', 'sentence'], ''));
    const setting = String(pick(p, ['scene', 'setting', 'background', 'place'], ''));
    const note = String(pick(p, ['note', 'mood', 'memo', 'direction'], ''));
    return {
      index: parseInt(pick(p, ['index', 'page', 'no', 'order'], i + 1), 10) || i + 1,
      narration: narration,
      setting: setting,
      characters: normCharacters(pick(p, ['characters', 'people', 'actors'], [])),
      action: '',           // analyze 단계에서 채움
      mood: note,
      rawPrompt: '',         // analyze 단계에서 채움
      userPrompt: ''         // 학생이 편집한 최종값
    };
  }).sort((a, b) => a.index - b.index);

  return {
    title: String(pick(input, ['title', 'name'], '제목 없음')),
    author: String(pick(input, ['author', 'writer', 'student'], '')),
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

// 장면 분석·프롬프트 조립 — 본문에서 행동/분위기를 추정하고 안전 가드를 삽입

// 본문에서 핵심 행동을 간단 추정(서술어 위주). 정교한 NLP 대신 규칙 기반(KISS).
function guessAction(narration) {
  if (!narration) return '';
  // 마지막 어절 위주로 동작 힌트 추출
  const m = narration.match(/([가-힣]+(?:었|았|해|하|러|으러|고)\w*)/g);
  return m ? m[m.length - 1] : narration.slice(0, 20);
}

// 분위기 추정(메모 우선, 없으면 본문 키워드)
function guessMood(page) {
  if (page.mood) return page.mood;
  const t = page.narration || '';
  if (/[웃기쁨행복즐]/.test(t)) return '밝고 즐거운';
  if (/[무섭깜깜어두두려]/.test(t)) return '조용하고 차분한'; // 초등 맥락: 과한 공포 톤 회피
  if (/[슬픔울눈물]/.test(t)) return '따뜻하고 위로가 되는';
  return '다정한';
}

// 부적절어 포함 여부(간단 필터)
// ※ 자동 삽입된 안전 접미사("비폭력" 등)가 차단어와 부분 일치해 오탐 나는 것을 막기 위해
//   검사 전 안전 접미사를 제거한다(학생이 통제하는 텍스트만 검사).
function hasBlocked(text) {
  const suffix = window.APP_CONFIG.SAFETY_SUFFIX || '';
  const cleaned = String(text || '').split(suffix).join('');
  const list = (window.APP_CONFIG.BLOCKLIST || []);
  return list.some(w => cleaned.includes(w));
}

// 페이지 + 공통조건 → 자동 프롬프트 문자열 조립
function buildPrompt(page, conds) {
  const c = conds || window.APP_CONFIG.DEFAULTS;
  const charPart = (page.characters || []).join(', ');
  const segs = [
    c.style,
    page.setting && ('배경: ' + page.setting),
    charPart && ('등장인물: ' + charPart),
    page.action && ('행동: ' + page.action),
    ('분위기: ' + (page.mood || '다정한')),
    c.palette && ('색감: ' + c.palette),
    c.tone && ('톤: ' + c.tone),
    window.APP_CONFIG.SAFETY_SUFFIX
  ].filter(Boolean);
  return segs.join(', ');
}

// 스토리 전체에 분석 적용 → 각 페이지의 action/mood/rawPrompt 채움
function analyzeStory(story, conds) {
  story.pages.forEach(p => {
    p.action = guessAction(p.narration);
    p.mood = guessMood(p);
    p.rawPrompt = buildPrompt(p, conds);
    if (!p.userPrompt) p.userPrompt = p.rawPrompt; // 학생 편집 전 기본값
  });
  return story;
}

window.Analyze = { analyzeStory, buildPrompt, hasBlocked };

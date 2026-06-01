// 캐릭터 시트 관리 — 등장인물 추출, 외형 설명, 기준 이미지(일관성용) 보관
//
// ※ MVP는 기준 이미지를 세션 내 base64로 보관. 추후 Google Drive 저장 후 ID 참조로 전환 권장
//   (GAS POST 본문 크기 한계 때문 — context-notes.md 참고).

// 스토리에서 모든 등장인물 키를 모아 CharacterRef[] 초기화
// 주인공은 항상 포함하고, 표지 본문 첫 문장을 외형 설명 기본값으로 시드(매 프롬프트에 실려 일관성↑).
// ※ 기준 이미지는 자동 지정하지 않는다 — 교사가 학생 그림을 보고 직접 '기준으로 지정'(채택 철학).
function extractCharacters(story) {
  const set = new Set();
  story.pages.forEach(p => (p.characters || []).forEach(k => set.add(k)));
  if (story.protagonist) set.add(story.protagonist);
  return Array.from(set).map(key => ({
    key: key,
    description: (key === story.protagonist) ? (story.protagonistHint || '') : '',
    refImageBase64: ''
  }));
}

// 특정 페이지에 등장하는 캐릭터의 기준 이미지 base64 배열 반환(참조 투입용)
function refImagesForPage(page, characters) {
  const byKey = {};
  characters.forEach(c => { byKey[c.key] = c; });
  return (page.characters || [])
    .map(k => byKey[k])
    .filter(c => c && c.refImageBase64)
    .map(c => c.refImageBase64);
}

// 아동 실물 사진 업로드를 막기 위한 안내(실제 차단은 불가, 경고만) + 용량 제한 체크
function validateRefImage(file) {
  if (!/^image\//.test(file.type)) return '이미지 파일만 올릴 수 있어요.';
  if (file.size > 2 * 1024 * 1024) return '이미지가 너무 큽니다(2MB 이하 권장).';
  return null;
}

// File → base64 data URL
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

window.Characters = { extractCharacters, refImagesForPage, validateRefImage, fileToDataUrl };

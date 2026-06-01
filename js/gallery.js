// 갤러리·검수 — 생성된 페이지 이미지 상태 관리(임시/채택), 결과 보관

// 페이지 index → { image, status: 'pending'|'approved', regenCount }
const _results = new Map();

function setResult(index, image) {
  const prev = _results.get(index) || { regenCount: 0 };
  _results.set(index, { image: image, status: 'pending', regenCount: prev.regenCount + (prev.image ? 1 : 0) });
  return _results.get(index);
}

function approve(index) {
  const r = _results.get(index);
  if (r) r.status = 'approved';
  return r;
}

function getResult(index) { return _results.get(index); }
function getAll() { return _results; }
function regenCount(index) { return (_results.get(index) || {}).regenCount || 0; }

// 채택된(또는 전체) 결과를 내보내기용 배열로
function collectForExport(story, approvedOnly) {
  const out = [];
  story.pages.forEach(p => {
    const r = _results.get(p.index);
    if (!r || !r.image) return;
    if (approvedOnly && r.status !== 'approved') return;
    out.push({ index: p.index, image: r.image, title: story.title, narration: p.narration });
  });
  return out;
}

window.Gallery = { setResult, approve, getResult, getAll, regenCount, collectForExport };

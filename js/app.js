// 상태·이벤트 배선 — 전체 화면 흐름을 잇는 오케스트레이터

const state = {
  story: null,        // 정규화된 스토리
  characters: [],     // CharacterRef[]
  conds: null         // 공통 조건
};

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show' + (kind ? ' ' + kind : '');
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// 공통 조건 패널 값 읽기
function readConds() {
  return {
    style: $('#cond-style').value.trim() || window.APP_CONFIG.DEFAULTS.style,
    aspectRatio: $('#cond-aspect').value,
    palette: $('#cond-palette').value.trim() || window.APP_CONFIG.DEFAULTS.palette,
    tone: $('#cond-tone').value.trim() || window.APP_CONFIG.DEFAULTS.tone
  };
}

// ── JSON 업로드 ──────────────────────────────
async function onUpload(file) {
  try {
    state.story = await Parse.readStoryFile(file);
    state.conds = readConds();
    Analyze.analyzeStory(state.story, state.conds);
    state.characters = Characters.extractCharacters(state.story);
    renderAll();
    toast(`"${state.story.title}" — ${state.story.pages.length}페이지 불러옴`, 'ok');
  } catch (err) {
    toast(err.message, 'err');
  }
}

// ── 렌더 ──────────────────────────────
function renderAll() {
  $('#book-title').textContent = state.story ? state.story.title : '';
  $('#book-author').textContent = state.story ? state.story.author : '';
  $('#workspace').hidden = !state.story;
  renderCharacters();
  renderPages();
}

function renderCharacters() {
  const wrap = $('#characters'); wrap.innerHTML = '';
  state.characters.forEach((c, i) => {
    const card = el('div', 'char-card');
    card.innerHTML = `
      <div class="char-head">🧸 <strong>${esc(c.key)}</strong></div>
      <input class="char-desc" placeholder="외형 설명(예: 갈색 귀, 파란 멜빵)" value="${esc(c.description)}">
      <div class="char-ref ${c.refImageBase64 ? 'has' : ''}">
        ${c.refImageBase64 ? `<img src="${c.refImageBase64}" alt="기준 이미지">` : '<span>기준 이미지 없음</span>'}
      </div>
      <label class="btn small">기준 이미지 올리기
        <input type="file" accept="image/*" hidden class="char-file">
      </label>`;
    card.querySelector('.char-desc').addEventListener('input', e => { c.description = e.target.value; });
    card.querySelector('.char-file').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      const bad = Characters.validateRefImage(f);
      if (bad) return toast(bad, 'err');
      c.refImageBase64 = await Characters.fileToDataUrl(f);
      renderCharacters();
    });
    wrap.appendChild(card);
  });
}

function renderPages() {
  const wrap = $('#pages'); wrap.innerHTML = '';
  state.story.pages.forEach(p => {
    const r = Gallery.getResult(p.index);
    const card = el('div', 'page-card');
    card.innerHTML = `
      <div class="page-no">${p.index}</div>
      <div class="page-body">
        <p class="narration">${esc(p.narration)}</p>
        <textarea class="prompt" rows="3">${esc(p.userPrompt)}</textarea>
        <div class="page-actions">
          <button class="btn gen">🎨 생성</button>
          <button class="btn ghost regen" ${r ? '' : 'disabled'}>↻ 재생성</button>
          <span class="meta"></span>
        </div>
      </div>
      <div class="page-image">
        ${r && r.image ? `<img src="${r.image}" alt="page ${p.index}">
          <button class="btn small approve ${r.status === 'approved' ? 'done' : ''}">${r.status === 'approved' ? '✅ 채택됨' : '검수 채택'}</button>` : '<span class="ph">미생성</span>'}
      </div>`;

    const ta = card.querySelector('.prompt');
    // 학생이 직접 손대면 _edited 표시 → 공통 조건 변경 시 덮어쓰지 않음
    ta.addEventListener('input', e => { p.userPrompt = e.target.value; p._edited = true; });
    card.querySelector('.gen').addEventListener('click', () => genPage(p, false));
    card.querySelector('.regen').addEventListener('click', () => genPage(p, true));
    const ap = card.querySelector('.approve');
    if (ap) ap.addEventListener('click', () => { Gallery.approve(p.index); renderPages(); toast(`${p.index}페이지 채택`, 'ok'); });
    wrap.appendChild(card);
  });
}

// ── 생성 ──────────────────────────────
async function genPage(page, bypassCache) {
  if (bypassCache && Gallery.regenCount(page.index) >= window.APP_CONFIG.MAX_REGEN_PER_PAGE) {
    return toast(`재생성은 페이지당 ${window.APP_CONFIG.MAX_REGEN_PER_PAGE}회까지예요.`, 'err');
  }
  if (Analyze.hasBlocked(page.userPrompt)) {
    return toast('프롬프트에 부적절한 단어가 있어요. 고쳐주세요.', 'err');
  }
  const res = await Generate.generateImage({
    prompt: page.userPrompt,
    refImages: Characters.refImagesForPage(page, state.characters),
    model: window.APP_CONFIG.MODEL_DEFAULT,
    aspectRatio: readConds().aspectRatio,
    classCode: $('#class-code').value.trim(),
    bypassCache: bypassCache
  });
  if (res.ok) {
    Gallery.setResult(page.index, res.image);
    renderPages();
    toast(`${page.index}페이지 생성 완료${res.demo ? ' (DEMO)' : ''}${res.cached ? ' (캐시)' : ''}`, 'ok');
  } else {
    toast(`생성 실패: ${res.error}`, 'err');
  }
}

// 전체 일괄 생성(순차 — 동시 부하 방지, 교사 페이싱)
async function genAll() {
  if (!state.story) return;
  const bar = $('#progress'); bar.hidden = false;
  const pages = state.story.pages;
  for (let i = 0; i < pages.length; i++) {
    $('#progress-fill').style.width = Math.round((i / pages.length) * 100) + '%';
    $('#progress-text').textContent = `${i + 1} / ${pages.length} 생성 중…`;
    await genPage(pages[i], false);
  }
  $('#progress-fill').style.width = '100%';
  $('#progress-text').textContent = '완료!';
  setTimeout(() => { bar.hidden = true; }, 1500);
}

// ── 내보내기 ──────────────────────────────
async function doExport(kind) {
  if (!state.story) return;
  const approvedOnly = $('#export-approved').checked;
  const items = Gallery.collectForExport(state.story, approvedOnly);
  if (!items.length) return toast(approvedOnly ? '채택된 이미지가 없습니다.' : '생성된 이미지가 없습니다.', 'err');
  try {
    if (kind === 'zip') await Export.exportZip(items, state.story.title);
    else await Export.exportPdf(items, state.story.title);
    toast(`${kind.toUpperCase()} 내보내기 완료(${items.length}장)`, 'ok');
  } catch (err) { toast(err.message, 'err'); }
}

// ── 초기화 ──────────────────────────────
function init() {
  // GAS_URL 미설정 시 DEMO 강제
  if (!window.APP_CONFIG.GAS_URL) {
    window.APP_CONFIG.DEMO = true;
    $('#mode-badge').textContent = 'DEMO 모드 (GAS 미연결)';
    $('#mode-badge').classList.add('demo');
  } else {
    $('#mode-badge').textContent = window.APP_CONFIG.DEMO ? 'DEMO 모드' : '실서버 연결';
  }

  // 공통 조건 기본값 주입
  const d = window.APP_CONFIG.DEFAULTS;
  $('#cond-style').value = d.style; $('#cond-palette').value = d.palette; $('#cond-tone').value = d.tone;

  $('#file-input').addEventListener('change', e => { if (e.target.files[0]) onUpload(e.target.files[0]); });
  $('#load-sample').addEventListener('click', async () => {
    try {
      const r = await fetch('./samples/sample-story.json');
      const blob = await r.blob();
      onUpload(new File([blob], 'sample-story.json', { type: 'application/json' }));
    } catch (e) { toast('샘플을 불러오지 못했습니다.', 'err'); }
  });
  $('#gen-all').addEventListener('click', genAll);
  $('#export-zip').addEventListener('click', () => doExport('zip'));
  $('#export-pdf').addEventListener('click', () => doExport('pdf'));

  // 공통 조건 변경 시 프롬프트 재조립(학생 편집본은 유지하지 않고 갱신할지 확인 토글)
  ['#cond-style', '#cond-aspect', '#cond-palette', '#cond-tone'].forEach(s => {
    $(s).addEventListener('change', () => {
      if (!state.story) return;
      state.conds = readConds();
      // 직접 수정하지 않은 페이지만 재조립(학생 편집 보존)
      let kept = 0;
      state.story.pages.forEach(p => { if (p._edited) kept++; else p.userPrompt = ''; });
      Analyze.analyzeStory(state.story, state.conds);
      renderPages();
      toast(kept ? `공통 조건 반영(직접 수정한 ${kept}개 페이지는 보존)` : '공통 조건을 프롬프트에 반영했어요.', 'ok');
    });
  });
}

document.addEventListener('DOMContentLoaded', init);

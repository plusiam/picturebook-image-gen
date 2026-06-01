// 프록시 호출·재시도·캐시·DEMO — GAS 프록시로 이미지 생성 요청

const _cache = new Map(); // 캐시 키 → imageBase64(data URL)

// 캐시 키 = 프롬프트 + 참조이미지 해시 + 모델 (재생성은 우회)
function cacheKey(prompt, refImages, model) {
  const refHash = (refImages || []).map(s => String(s).length).join('-');
  return model + '|' + prompt + '|' + refHash;
}

// DEMO용 플레이스홀더 SVG(data URL) — 키 없이 파이프라인 검증
function demoImage(prompt) {
  const text = (prompt || '').slice(0, 40).replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="384">
    <rect width="512" height="384" fill="#fde9d9"/>
    <rect x="16" y="16" width="480" height="352" fill="none" stroke="#e8a87c" stroke-width="3"/>
    <text x="256" y="180" font-size="22" text-anchor="middle" fill="#a05a2c">DEMO 이미지</text>
    <text x="256" y="220" font-size="13" text-anchor="middle" fill="#7a4a2a">${text}</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// 한 장 생성. opts: { prompt, refImages, model, aspectRatio, classCode, bypassCache }
async function generateImage(opts) {
  const cfg = window.APP_CONFIG;
  const model = opts.model || cfg.MODEL_DEFAULT;
  const key = cacheKey(opts.prompt, opts.refImages, model);

  if (!opts.bypassCache && _cache.has(key)) return { ok: true, image: _cache.get(key), cached: true };

  // DEMO 모드(또는 GAS_URL 미설정)
  if (cfg.DEMO || !cfg.GAS_URL) {
    await new Promise(r => setTimeout(r, 300)); // 생성 지연 흉내
    const img = demoImage(opts.prompt);
    _cache.set(key, img);
    return { ok: true, image: img, demo: true };
  }

  // 실제 GAS 호출 — text/plain 단순 요청(CORS 프리플라이트 회피)
  const payload = {
    action: 'generate',
    classCode: opts.classCode || '',
    prompt: opts.prompt,
    model: model,
    // 화면비는 플래그가 켜졌을 때만 전달(responseFormat 필드 형태 미검증 → 기본 비활성)
    aspectRatio: cfg.USE_ASPECT_RATIO ? opts.aspectRatio : undefined,
    refImages: opts.refImages || []
  };

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) { // 1회 재시도
    try {
      const res = await fetch(cfg.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        const img = 'data:image/png;base64,' + data.imageBase64;
        _cache.set(key, img);
        return { ok: true, image: img };
      }
      lastErr = data.error || '생성 실패';
      if (data.code === 'FORBIDDEN' || data.code === 'QUOTA_EXCEEDED' || data.code === 'KILL_SWITCH') {
        return { ok: false, error: lastErr, code: data.code }; // 재시도 무의미
      }
    } catch (err) {
      lastErr = '네트워크 오류: ' + err.message;
    }
  }
  return { ok: false, error: lastErr };
}

window.Generate = { generateImage, clearCache: () => _cache.clear() };

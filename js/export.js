// 내보내기 — 생성 이미지를 ZIP 또는 PDF로 저장 (JSZip / jsPDF CDN 사용)

// data URL → 순수 base64
function toBase64(dataUrl) {
  const i = dataUrl.indexOf('base64,');
  return i >= 0 ? dataUrl.slice(i + 7) : dataUrl;
}

// data URL의 MIME에서 확장자 추정
function extOf(dataUrl) {
  if (dataUrl.indexOf('image/png') >= 0) return 'png';
  if (dataUrl.indexOf('image/svg') >= 0) return 'svg';
  if (dataUrl.indexOf('image/jpeg') >= 0) return 'jpg';
  return 'png';
}

// ZIP 내보내기 — items: [{ index, image, title }]
async function exportZip(items, bookTitle) {
  if (!window.JSZip) throw new Error('JSZip 로드 실패(인터넷 연결 확인).');
  if (!items.length) throw new Error('내보낼 이미지가 없습니다.');
  const zip = new JSZip();
  items.forEach(it => {
    const name = `page-${String(it.index).padStart(2, '0')}.${extOf(it.image)}`;
    zip.file(name, toBase64(it.image), { base64: true });
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, (bookTitle || 'storybook') + '.zip');
}

// PDF 내보내기 — 페이지마다 이미지 + 본문 캡션
async function exportPdf(items, bookTitle) {
  const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDFCtor) throw new Error('jsPDF 로드 실패(인터넷 연결 확인).');
  if (!items.length) throw new Error('내보낼 이미지가 없습니다.');

  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  for (let i = 0; i < items.length; i++) {
    if (i > 0) doc.addPage();
    const it = items[i];
    const fmt = extOf(it.image) === 'jpg' ? 'JPEG' : 'PNG';
    try {
      // SVG(DEMO)는 jsPDF가 직접 못 그리므로 캔버스 변환
      const png = it.image.indexOf('image/svg') >= 0 ? await svgToPng(it.image) : it.image;
      doc.addImage(png, fmt, 20, 15, W - 40, H - 45);
    } catch (e) { /* 이미지 실패 시 캡션만 */ }
    doc.setFontSize(12);
    doc.text(`${it.index}. ${it.narration || ''}`, 20, H - 15, { maxWidth: W - 40 });
  }
  doc.save((bookTitle || 'storybook') + '.pdf');
}

// SVG data URL → PNG data URL(캔버스 경유)
function svgToPng(svgDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 512; canvas.height = img.height || 384;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('SVG 변환 실패'));
    img.src = svgDataUrl;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.Export = { exportZip, exportPdf };

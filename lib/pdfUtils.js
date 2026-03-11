// lib/pdfUtils.js
// Converts a PDF file into an array of base64 JPEG strings (one per page)
// Runs entirely in the browser using PDF.js from CDN

let pdfjsLibCache = null;

async function getPdfJs() {
  if (pdfjsLibCache) return pdfjsLibCache;

  // Load PDF.js from CDN
  await new Promise((resolve, reject) => {
    if (document.querySelector('script[data-pdfjs]')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.setAttribute('data-pdfjs', '1');
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  pdfjsLibCache = window.pdfjsLib;
  return pdfjsLibCache;
}

/**
 * @param {File} file
 * @param {(page: number, total: number) => void} onPageDone
 * @param {number} scale  render scale (1.8 = ~good quality/size balance)
 * @returns {Promise<string[]>} base64 JPEG strings
 */
export async function pdfToImages(file, onPageDone, scale = 1.8) {
  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const total = pdf.numPages;
  const images = [];

  for (let pageNum = 1; pageNum <= total; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
    images.push(base64);
    onPageDone(pageNum, total);
  }

  return images;
}

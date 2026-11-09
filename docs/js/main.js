import { mountApp } from './app.js';
import { extractPages } from './pdf-text.js';
import { createEmbedder } from './embed.js';

// The PDF reader is loaded only when a document is first opened.
let pdfjs;
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

mountApp(document, {
  loadPdfjs,
  extractPages,
  createEmbedder,
  async fetchSample() {
    const res = await fetch(new URL('../sample/sourdough-guide.pdf', import.meta.url));
    if (!res.ok) throw new Error('sample missing');
    return new Uint8Array(await res.arrayBuffer());
  },
});

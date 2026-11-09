import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const fixture = (name) => new Uint8Array(readFileSync(path.join(here, 'fixtures', name)));

// The same bundled pdf.js the web page uses.
export async function loadPdfjs() {
  const dir = path.join(here, '..', 'docs', 'vendor', 'pdfjs');
  const pdfjs = await import(pathToFileURL(path.join(dir, 'pdf.min.mjs')).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(dir, 'pdf.worker.min.mjs')).href;
  return pdfjs;
}

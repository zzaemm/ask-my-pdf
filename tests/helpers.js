import { tokenize } from '../docs/js/tokenize.js';
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

// A stand-in for the real model: hashed bag of words, with a few made-up "synonyms"
// so that wording differences (hot / temperature) are bridged the way an embedding would.
const SYNONYMS = { hot: 'temperature', degrees: 'temperature', celsius: 'temperature', rise: 'proof', rest: 'proof' };
const DIM = 4096; // large enough that unrelated words do not collide
const hash = (w) => [...w].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % DIM;
export const fakeEmbedder = {
  model: 'fake',
  async embed(texts) {
    return texts.map((t) => {
      const v = new Float32Array(DIM);
      for (const w of tokenize(t)) v[hash(SYNONYMS[w] ?? w)] += 1;
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  },
};

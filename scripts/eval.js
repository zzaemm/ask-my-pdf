// Measures classic search against the optional smarter search on the sample guide.
//
//   npm install --no-save @huggingface/transformers
//   npm run eval
//
// The first run downloads the 23 MB model and caches it. Not part of `npm test` (needs a download).
import { readFileSync } from 'node:fs';
import { buildIndex, ask } from '../docs/js/answer.js';
import { extractPages } from '../docs/js/pdf-text.js';
import { embedIndex, askSmart, MIN_SIMILARITY } from '../docs/js/smart.js';
import { createEmbedder } from '../docs/js/embed.js';
import { GOOD, HELD_OUT, OFF_TOPIC } from '../tests/questions.js';
import { loadPdfjs } from '../tests/helpers.js';

const pdf = new Uint8Array(readFileSync(new URL('../docs/sample/sourdough-guide.pdf', import.meta.url)));
const { pages } = await extractPages(pdf, await loadPdfjs());
const index = buildIndex(pages);

const embedder = await createEmbedder({ importer: () => import('@huggingface/transformers') });
await embedIndex(index, embedder);

const hit = (r, phrase, page) => r.status === 'answer' && r.answer.toLowerCase().includes(phrase.toLowerCase()) && r.page === page;
const verbose = process.argv.includes('--verbose');

async function run(label, questions) {
  let classic = 0;
  let smart = 0;
  for (const [q, phrase, page] of questions) {
    const c = hit(ask(index, q), phrase, page);
    const rs = await askSmart(index, q, embedder);
    const s = hit(rs, phrase, page);
    classic += c;
    smart += s;
    if (verbose || !s) console.log(`${c ? 'C' : '-'}${s ? 'S' : '-'}  ${q}  =>  ${rs.status === 'answer' ? rs.answer.slice(0, 80) : '[' + rs.reason + ']'}`);
  }
  console.log(`${label}: classic ${classic}/${questions.length}, smarter ${smart}/${questions.length}`);
}

await run('questions used while tuning  ', GOOD);
await run('held-out questions           ', HELD_OUT);

let cRefused = 0;
let sRefused = 0;
for (const q of OFF_TOPIC) {
  cRefused += ask(index, q).status === 'no_answer';
  const r = await askSmart(index, q, embedder);
  sRefused += r.status === 'no_answer';
  if (verbose || r.status === 'answer') console.log(`off-topic answered: ${q} => ${r.answer?.slice(0, 60)}`);
}
console.log(`off-topic refused           : classic ${cRefused}/${OFF_TOPIC.length}, smarter ${sRefused}/${OFF_TOPIC.length}`);
console.log(`(MIN_SIMILARITY = ${MIN_SIMILARITY})`);

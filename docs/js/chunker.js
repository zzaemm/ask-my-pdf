// Splits page text into sentences, then groups sentences into short passages
// that remember their page number and the section heading above them.

const ABBREVIATIONS = ['e.g.', 'i.e.', 'etc.', 'vs.', 'approx.', 'fig.', 'no.', 'dr.', 'mr.', 'mrs.', 'ms.', 'st.', 'min.', 'max.'];
const DOT = '\u0000'; // stands in for the dot of an abbreviation while splitting

const wordCount = (s) => (s.match(/\S+/g) || []).length;

function protect(text) {
  let out = text;
  for (const a of ABBREVIATIONS) {
    const re = new RegExp(`(^|[^\\p{L}])${a.replace(/\./g, '\\.')}`, 'giu');
    out = out.replace(re, (m) => m.replace(/\./g, DOT));
  }
  return out;
}

export function splitSentences(text) {
  const flat = protect(text.replace(/\s+/g, ' ').trim());
  if (!flat) return [];
  return flat
    .split(/(?<=[.!?]["')\]]?)\s+(?=["'(\[]?[\p{Lu}\p{N}])/u)
    .map((s) => s.split(DOT).join('.').trim())
    .filter(Boolean);
}

// A heading is a short line that does not end like a sentence.
export function isHeading(block) {
  const t = block.trim();
  return t.length > 0 && !t.includes('\n') && wordCount(t) <= 9 && !/[.!?:;,]$/.test(t);
}

export function chunkPages(pages, { maxWords = 80, overlap = 1 } = {}) {
  const chunks = [];
  for (const { page, text } of pages) {
    let heading = '';
    let current = [];

    const flush = () => {
      if (!current.length) return;
      chunks.push({
        id: chunks.length,
        page,
        heading,
        sentences: current,
        text: current.join(' '),
      });
      current = overlap > 0 && current.length > 1 ? current.slice(-overlap) : [];
    };

    for (const block of text.split(/\n{2,}/)) {
      if (!block.trim()) continue;
      if (isHeading(block)) {
        flush();
        current = []; // never carry sentences across a new section
        heading = block.trim();
        continue;
      }
      for (const sentence of splitSentences(block)) {
        const size = wordCount(current.join(' ')) + wordCount(sentence);
        if (current.length && size > maxWords) flush();
        current.push(sentence);
      }
    }
    flush();
    // the trailing overlap of the page's last chunk must not leak into the next page
    current = [];
  }
  return chunks;
}

// Reads a PDF with pdf.js and returns readable text for each page, with blank
// lines between paragraphs and headings. pdf.js is passed in so that the browser
// page and the Node tests can use the same code with the same bundled library.

export class PdfError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PdfError';
    this.code = code;
  }
}

export function explainPdfError(err) {
  if (err instanceof PdfError) return err;
  switch (err && err.name) {
    case 'PasswordException':
      return new PdfError('PASSWORD', 'This PDF is password-protected. Remove the password and try again.');
    case 'InvalidPDFException':
    case 'FormatError':
      return new PdfError('INVALID', 'This file does not look like a valid PDF.');
    case 'MissingPDFException':
      return new PdfError('MISSING', 'The PDF could not be found.');
    default:
      return new PdfError('UNKNOWN', `Could not read this PDF (${(err && err.message) || 'unknown error'}).`);
  }
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// pdf.js gives text fragments with positions. Group them into lines by baseline,
// lines into paragraphs by the gap between them, and undo hyphenation at line ends.
export function itemsToText(items) {
  const lines = [];
  let line = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const h = it.height || Math.abs(it.transform[3]) || 10;
    if (!line || Math.abs(y - line.y) > h * 0.5) {
      line = { y, h, text: '', endX: x };
      lines.push(line);
    }
    const needsSpace = line.text && !line.text.endsWith(' ') && !it.str.startsWith(' ') && x - line.endX > h * 0.15;
    line.text += (needsSpace ? ' ' : '') + it.str;
    line.endX = x + (it.width || 0);
  }

  const real = lines.filter((l) => l.text.trim());
  if (!real.length) return '';
  const gaps = real.slice(1).map((l, i) => Math.abs(real[i].y - l.y)).filter((g) => g > 0);
  const normalGap = median(gaps);

  const paragraphs = [];
  let para = [];
  real.forEach((l, i) => {
    const prev = real[i - 1];
    const newPara = prev && (Math.abs(prev.y - l.y) > normalGap * 1.45 || Math.abs(prev.h - l.h) > 1.5);
    if (newPara) {
      paragraphs.push(para);
      para = [];
    }
    para.push(l.text.trim());
  });
  paragraphs.push(para);

  return paragraphs
    .map((ls) =>
      ls.reduce((acc, next) => (/[\p{L}]-$/u.test(acc) && /^\p{Ll}/u.test(next) ? acc.slice(0, -1) + next : `${acc} ${next}`))
    )
    .join('\n\n');
}

// Returns { pages: [{page, text}], numPages, truncated, lowTextPages: [page numbers] }.
// lowTextPages are pages with almost no selectable text, usually scans.
export async function extractPages(data, pdfjs, { onProgress, maxPages = 500 } = {}) {
  const bytes = new Uint8Array(data instanceof ArrayBuffer ? data.slice(0) : data.slice());
  // verbosity 0 = errors only; the missing-font-data warnings are irrelevant when only reading text
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy();
    throw explainPdfError(err);
  }
  try {
    const last = Math.min(doc.numPages, maxPages);
    const pages = [];
    for (let n = 1; n <= last; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ page: n, text: itemsToText(content.items) });
      page.cleanup();
      if (onProgress) onProgress(n, last);
    }
    return {
      pages,
      numPages: doc.numPages,
      truncated: doc.numPages > last,
      lowTextPages: pages.filter((p) => p.text.length < 20).map((p) => p.page),
    };
  } catch (err) {
    throw explainPdfError(err);
  } finally {
    await task.destroy();
  }
}

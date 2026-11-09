import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPages, itemsToText, explainPdfError, PdfError } from '../docs/js/pdf-text.js';
import { fixture, loadPdfjs } from './helpers.js';

const item = (str, x, y, { h = 11, w = str.length * 5 } = {}) => ({ str, transform: [1, 0, 0, h, x, y], height: h, width: w });

test('items on the same baseline become one line, with a space where there is a gap', () => {
  const text = itemsToText([item('Hello', 10, 700), item('world', 50, 700)]);
  assert.equal(text, 'Hello world');
});

test('does not add a space between fragments that touch', () => {
  assert.equal(itemsToText([item('sour', 10, 700, { w: 20 }), item('dough', 30, 700)]), 'sourdough');
});

test('a larger gap between lines starts a new paragraph', () => {
  const items = [item('one', 10, 700), item('two', 10, 684), item('three', 10, 668), item('four', 10, 630)];
  assert.equal(itemsToText(items), 'one two three\n\nfour');
});

test('a change of text size starts a new paragraph (headings)', () => {
  const items = [item('Title', 10, 700, { h: 18 }), item('body text', 10, 680, { h: 11 })];
  assert.equal(itemsToText(items), 'Title\n\nbody text');
});

test('joins words hyphenated across a line break', () => {
  const items = [item('the infor-', 10, 700), item('mation here', 10, 684), item('end', 10, 668)];
  assert.equal(itemsToText(items), 'the information here end');
});

test('keeps a real hyphen followed by a capital or number', () => {
  const items = [item('see COVID-', 10, 700), item('19 rules', 10, 684)];
  assert.equal(itemsToText(items), 'see COVID- 19 rules');
});

test('ignores empty fragments and non-text marks', () => {
  assert.equal(itemsToText([{ type: 'beginMarkedContent' }, item('', 10, 700), item('Hi', 10, 700)]), 'Hi');
  assert.equal(itemsToText([]), '');
});

test('extracts every page of a real PDF in order', async () => {
  const pdfjs = await loadPdfjs();
  const r = await extractPages(fixture('sourdough-guide.pdf'), pdfjs);
  assert.equal(r.numPages, 4);
  assert.equal(r.truncated, false);
  assert.deepEqual(r.lowTextPages, []);
  assert.match(r.pages[0].text, /about seven days/);
  assert.match(r.pages[1].text, /350 grams of water/);
  assert.match(r.pages[2].text, /4 to 6 hours/);
  assert.match(r.pages[3].text, /at least 96 degrees Celsius/);
});

test('real PDF paragraphs and headings come out as separate blocks', async () => {
  const pdfjs = await loadPdfjs();
  const { pages } = await extractPages(fixture('sourdough-guide.pdf'), pdfjs);
  const blocks = pages[0].text.split('\n\n');
  assert.equal(blocks[0], "A Beginner's Guide to Sourdough Bread");
  assert.equal(blocks[1], 'What is sourdough?');
  assert.equal(blocks[3], 'Making a starter');
  assert.equal(blocks.length, 7);
  // no stray line breaks inside paragraphs
  for (const p of pages.flatMap((x) => x.text.split('\n\n'))) assert.ok(!p.includes('\n'));
});

test('does not modify the bytes the caller passed in', async () => {
  const pdfjs = await loadPdfjs();
  const data = fixture('sourdough-guide.pdf');
  const copy = data.slice();
  await extractPages(data, pdfjs);
  assert.deepEqual(data, copy);
});

test('maxPages truncates and says so; progress is reported', async () => {
  const pdfjs = await loadPdfjs();
  const calls = [];
  const r = await extractPages(fixture('sourdough-guide.pdf'), pdfjs, { maxPages: 2, onProgress: (n, t) => calls.push([n, t]) });
  assert.equal(r.pages.length, 2);
  assert.equal(r.truncated, true);
  assert.deepEqual(calls, [[1, 2], [2, 2]]);
});

test('a page with no text is reported as low-text', async () => {
  const pdfjs = await loadPdfjs();
  const r = await extractPages(fixture('blank-page.pdf'), pdfjs);
  assert.deepEqual(r.lowTextPages, [1]);
});

test('a file that is not a PDF gives a clear error', async () => {
  const pdfjs = await loadPdfjs();
  await assert.rejects(
    extractPages(new TextEncoder().encode('just some text, not a pdf'), pdfjs),
    (e) => e instanceof PdfError && e.code === 'INVALID' && /valid PDF/.test(e.message)
  );
});

test('error names map to friendly messages', () => {
  assert.equal(explainPdfError({ name: 'PasswordException' }).code, 'PASSWORD');
  assert.equal(explainPdfError(new Error('boom')).code, 'UNKNOWN');
  const own = new PdfError('X', 'y');
  assert.equal(explainPdfError(own), own);
});

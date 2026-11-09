import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, isHeading, chunkPages } from '../docs/js/chunker.js';

test('splits on sentence ends', () => {
  assert.deepEqual(splitSentences('Mix the dough. Let it rest! Is it ready? Yes.'), [
    'Mix the dough.',
    'Let it rest!',
    'Is it ready?',
    'Yes.',
  ]);
});

test('does not split inside decimals or after common abbreviations', () => {
  assert.deepEqual(splitSentences('Rest it for 1.5 hours, e.g. overnight. Then bake.'), [
    'Rest it for 1.5 hours, e.g. overnight.',
    'Then bake.',
  ]);
  assert.deepEqual(splitSentences('Dr. Lee said use approx. 300 g flour. Done.'), [
    'Dr. Lee said use approx. 300 g flour.',
    'Done.',
  ]);
});

test('keeps quoted sentence endings together', () => {
  assert.deepEqual(splitSentences('She said "bake it." Then she left.'), ['She said "bake it."', 'Then she left.']);
});

test('handles empty and whitespace-only text', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('  \n  '), []);
});

test('recognises headings but not sentences or lists', () => {
  assert.equal(isHeading('Mixing and folding'), true);
  assert.equal(isHeading('Bake it for twenty minutes.'), false);
  assert.equal(isHeading('Ingredients:'), false);
  assert.equal(isHeading('line one\nline two'), false);
  assert.equal(isHeading('this is a long line of ordinary text without any ending punctuation at all'), false);
});

const sentences = (n, prefix = 'S') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1} has five small words.`).join(' ');

test('chunks remember their page and section heading', () => {
  const chunks = chunkPages([
    { page: 1, text: `The starter\n\n${sentences(2)}` },
    { page: 2, text: `Baking\n\n${sentences(2, 'B')}` },
  ]);
  assert.deepEqual(chunks.map((c) => [c.page, c.heading]), [[1, 'The starter'], [2, 'Baking']]);
  assert.deepEqual(chunks.map((c) => c.id), [0, 1]);
});

test('long text becomes several chunks, each within the word budget, with overlap', () => {
  const chunks = chunkPages([{ page: 1, text: sentences(30) }], { maxWords: 30, overlap: 1 });
  assert.ok(chunks.length > 3);
  for (const c of chunks) assert.ok(c.text.split(/\s+/).length <= 30);
  // consecutive chunks share their boundary sentence
  assert.equal(chunks[0].sentences.at(-1), chunks[1].sentences[0]);
});

test('overlap can be switched off', () => {
  const chunks = chunkPages([{ page: 1, text: sentences(30) }], { maxWords: 30, overlap: 0 });
  assert.notEqual(chunks[0].sentences.at(-1), chunks[1].sentences[0]);
});

test('a single huge sentence still becomes a chunk instead of looping forever', () => {
  const long = Array(200).fill('word').join(' ') + '.';
  const chunks = chunkPages([{ page: 1, text: long }], { maxWords: 20 });
  assert.equal(chunks.length, 1);
});

test('chunks never cross pages or headings', () => {
  const chunks = chunkPages([
    { page: 1, text: `${sentences(2, 'A')}\n\nNext part\n\n${sentences(2, 'B')}` },
    { page: 2, text: sentences(2, 'C') },
  ]);
  for (const c of chunks) {
    const letters = new Set(c.sentences.map((s) => s[0]));
    assert.equal(letters.size, 1, `mixed content in chunk ${c.id}`);
  }
  assert.deepEqual(chunks.map((c) => c.page), [1, 1, 2]);
});

test('skips blank pages', () => {
  const chunks = chunkPages([{ page: 1, text: '   ' }, { page: 2, text: 'Real content here.' }]);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].page, 2);
});

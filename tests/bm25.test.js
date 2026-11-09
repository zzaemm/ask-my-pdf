import test from 'node:test';
import assert from 'node:assert/strict';
import { BM25 } from '../docs/js/bm25.js';

const docs = [
  ['dough', 'rise', 'four', 'hour'],
  ['starter', 'feed', 'flour', 'water'],
  ['oven', 'preheat', 'dutch', 'oven', 'oven'],
  ['flour', 'water', 'salt', 'flour', 'flour'],
];
const bm = new BM25(docs);

test('ranks the document containing the query term first', () => {
  const hits = bm.search(['dough']);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].index, 0);
});

test('rarer terms count for more than common ones', () => {
  assert.ok(bm.idf('dough') > bm.idf('flour'));
});

test('idf never goes negative, even for a term in every document', () => {
  const all = new BM25([['a'], ['a'], ['a']]);
  assert.ok(all.idf('a') > 0);
});

test('repeated terms help, but with diminishing returns', () => {
  const one = bm.score(['oven'], 2);
  const lots = new BM25([['oven'], ['oven', 'oven', 'oven', 'oven', 'oven', 'oven'], ['x']]);
  const a = lots.score(['oven'], 0);
  const b = lots.score(['oven'], 1);
  assert.ok(one > 0 && b > a && b < a * 6);
});

test('a short focused document beats a long one with the same single mention', () => {
  const m = new BM25([['salt'], ['salt', ...Array(40).fill('filler')], ['other']]);
  const [first] = m.search(['salt']);
  assert.equal(first.index, 0);
});

test('combines several query terms and ignores duplicates in the query', () => {
  const hits = bm.search(['flour', 'water']);
  assert.deepEqual(hits.map((h) => h.index).sort(), [1, 3]);
  assert.equal(bm.score(['flour', 'flour'], 3), bm.score(['flour'], 3));
});

test('limits results to k and returns nothing for unknown terms or empty queries', () => {
  assert.equal(bm.search(['flour', 'oven', 'dough', 'starter'], 2).length, 2);
  assert.deepEqual(bm.search(['zebra']), []);
  assert.deepEqual(bm.search([]), []);
});

test('works on an empty collection', () => {
  const empty = new BM25([]);
  assert.deepEqual(empty.search(['x']), []);
});

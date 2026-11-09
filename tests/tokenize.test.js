import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, stem, isStopword } from '../docs/js/tokenize.js';

test('lowercases and splits on punctuation', () => {
  assert.deepEqual(tokenize('Hello, World! 2 cups.'), ['hello', 'world', '2', 'cup']);
});

test('drops stopwords unless asked to keep them', () => {
  assert.deepEqual(tokenize('What is the best flour?'), ['best', 'flour']);
  assert.ok(tokenize('What is the best flour?', { keepStopwords: true }).includes('the'));
});

test('related word forms share a stem', () => {
  const same = [
    ['rise', 'rising', 'rises'],
    ['bake', 'baked', 'baking', 'bakes'],
    ['loaf', 'loafs'],
    ['starter', 'starters'],
    ['run', 'running'],
  ];
  for (const group of same) {
    const stems = new Set(group.map(stem));
    assert.equal(stems.size, 1, `${group.join(', ')} -> ${[...stems].join(', ')}`);
  }
});

test('different words keep different stems', () => {
  assert.notEqual(stem('flour'), stem('flower'));
  assert.notEqual(stem('bread'), stem('breath'));
});

test('short words and numbers are left alone', () => {
  assert.equal(stem('gas'), 'gas');
  assert.equal(stem('250s'), '250s');
  assert.equal(stem('96'), '96');
});

test('handles accents, non-Latin scripts and empty input', () => {
  assert.deepEqual(tokenize('Café'), ['café']);
  assert.deepEqual(tokenize('crème'), tokenize('crèmes'));
  assert.deepEqual(tokenize('കേരളം ഭക്ഷണം'), ['കേരളം', 'ഭക്ഷണം']);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   ...   '), []);
});

test('extra stopwords are skipped too', () => {
  assert.deepEqual(tokenize('how long flour', { extraStopwords: new Set(['long']) }), ['flour']);
});

test('isStopword is case-insensitive', () => {
  assert.equal(isStopword('The'), true);
  assert.equal(isStopword('flour'), false);
});

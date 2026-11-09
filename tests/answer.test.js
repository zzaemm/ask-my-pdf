import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, ask, queryTerms, highlightRanges, MIN_COVERAGE } from '../docs/js/answer.js';
import { extractPages } from '../docs/js/pdf-text.js';
import { fixture, loadPdfjs } from './helpers.js';

const pdfjs = await loadPdfjs();
const { pages } = await extractPages(fixture('sourdough-guide.pdf'), pdfjs);
const index = buildIndex(pages);

// Questions a reader would really ask, with a phrase the answer must contain and the page it is on.
const GOOD = [
  ['How long does it take to make a starter?', 'about seven days', 1],
  ['What temperature should the starter be kept at?', 'between 24 and 27 degrees Celsius', 1],
  ['What does a hungry starter smell like?', 'nail polish', 1],
  ['How much water is in the basic recipe?', '350 grams of water', 2],
  ['How much salt do I need?', '10 grams of salt', 2],
  ['Which flour gives a chewier loaf?', 'Bread flour', 2],
  ['How long is bulk fermentation?', '4 to 6 hours', 3],
  ['How long should I cold proof the dough?', '12 to 16 hours', 3],
  ['What is autolyse?', 'autolyse', 3],
  ['What temperature do I preheat the Dutch oven to?', '250 degrees Celsius for 45 minutes', 4],
  ['Why is my loaf dense?', 'starter was not active enough', 4],
  ['How long should bread cool before slicing?', 'at least one hour', 4],
  ['How should I store the loaf?', 'cut side down', 4],
  ['How do I freeze bread?', 'freeze it for up to three months', 4],
];

const OFF_TOPIC = [
  'Who won the football world cup in 2018?',
  'What is the capital of France?',
  'How do I change a flat tire?',
  'How much does a loaf of bread cost in London?',
  'Explain quantum computing',
];

test('indexing the sample guide produces passages on all four pages', () => {
  assert.deepEqual([...new Set(index.chunks.map((c) => c.page))], [1, 2, 3, 4]);
});

for (const [question, phrase, page] of GOOD) {
  test(`answers: ${question}`, () => {
    const r = ask(index, question);
    assert.equal(r.status, 'answer', `expected an answer, got ${r.reason}`);
    assert.ok(r.answer.includes(phrase), `"${r.answer}" should include "${phrase}"`);
    assert.equal(r.page, page);
    assert.equal(r.sources[0].page, page);
  });
}

for (const question of OFF_TOPIC) {
  test(`refuses: ${question}`, () => {
    assert.equal(ask(index, question).status, 'no_answer');
  });
}

test('every good question is answered, so refusing is not just a blanket policy', () => {
  const answered = GOOD.filter(([q]) => ask(index, q).status === 'answer').length;
  assert.equal(answered, GOOD.length);
});

test('a refusal due to weak coverage still shows the closest passage', () => {
  const r = ask(index, 'How much does a loaf of bread cost in London?');
  assert.equal(r.reason, 'LOW_COVERAGE');
  assert.equal(r.sources.length, 1);
  assert.ok(r.message.length > 20);
});

test('empty or all-filler questions ask for more detail', () => {
  assert.equal(ask(index, '').reason, 'EMPTY');
  assert.equal(ask(index, 'what is the').reason, 'EMPTY');
  assert.equal(ask(index, 'how much??').reason, 'EMPTY');
});

test('answers include confidence, coverage and highlighted source text', () => {
  const r = ask(index, 'How long is bulk fermentation?');
  assert.ok(['high', 'medium', 'low'].includes(r.confidence));
  assert.ok(r.coverage >= MIN_COVERAGE && r.coverage <= 1);
  const s = r.sources[0];
  // "bulk fermentation" is in the section heading, not in the passage text
  assert.ok(s.headingHighlights.length > 0);
  for (const { start, end } of [...s.highlights, ...s.headingHighlights]) assert.ok(start < end);
});

test('highlights cover related word forms', () => {
  const text = 'Bake it. Baking takes time; baked loaves cool.';
  const spans = highlightRanges(text, queryTerms('bakes')).map(({ start, end }) => text.slice(start, end));
  assert.deepEqual(spans, ['Bake', 'Baking', 'baked']);
});

test('works on tiny and empty documents', () => {
  const one = buildIndex([{ page: 1, text: 'The tea steeps for three minutes.' }]);
  assert.equal(ask(one, 'How long does tea steep?').status, 'answer');
  const none = buildIndex([{ page: 1, text: '' }]);
  assert.equal(ask(none, 'anything at all').status, 'no_answer');
});

test('page numbers stay correct across several documents merged into one index', () => {
  const merged = buildIndex([
    { page: 1, text: 'Cats sleep for sixteen hours each day.' },
    { page: 2, text: 'Rockets burn liquid oxygen with kerosene.' },
  ]);
  assert.equal(ask(merged, 'What do rockets burn?').page, 2);
});

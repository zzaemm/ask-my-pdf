import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../docs/js/answer.js';
import { embedIndex, askSmart, MIN_SIMILARITY } from '../docs/js/smart.js';
import { createEmbedder } from '../docs/js/embed.js';
import { fakeEmbedder } from './helpers.js';

const pages = [
  { page: 1, text: 'Oven\n\nPreheat the oven to 250 degrees Celsius for 45 minutes before baking.' },
  { page: 2, text: 'Resting\n\nLet the dough proof for twelve hours in the fridge. A longer proof gives more flavour.' },
  { page: 3, text: 'Storage\n\nKeep the loaf cut side down on a wooden board.' },
];
const index = buildIndex(pages);
await embedIndex(index, fakeEmbedder);

test('embedIndex stores one vector per passage and remembers the model', () => {
  assert.equal(index.vectors.length, index.chunks.length);
  assert.equal(index.model, 'fake');
});

test('finds an answer that shares no words with the question', async () => {
  const r = await askSmart(index, 'How hot should it be?', fakeEmbedder);
  assert.equal(r.status, 'answer');
  assert.equal(r.mode, 'smart');
  assert.match(r.answer, /250 degrees/);
  assert.equal(r.page, 1);
  assert.equal(r.sources[0].page, 1);
});

test('refuses when nothing is close enough, and still shows the closest passage', async () => {
  const r = await askSmart(index, 'Who won the football world cup?', fakeEmbedder);
  assert.equal(r.status, 'no_answer');
  assert.equal(r.reason, 'LOW_SIMILARITY');
  assert.equal(r.sources.length, 1);
  assert.ok(MIN_SIMILARITY > 0 && MIN_SIMILARITY < 1);
});

test('empty questions ask for more detail', async () => {
  assert.equal((await askSmart(index, '   ', fakeEmbedder)).reason, 'EMPTY');
});

test('asking before embedding the document is a clear error', async () => {
  await assert.rejects(askSmart(buildIndex(pages), 'anything', fakeEmbedder), /embedIndex/);
});

test('embedIndex reports progress', async () => {
  const seen = [];
  await embedIndex(buildIndex(pages), fakeEmbedder, { onProgress: (done, total) => seen.push([done, total]) });
  assert.deepEqual(seen.at(-1), [seen.at(-1)[1], seen.at(-1)[1]]);
});

test('createEmbedder wraps the library pipeline and returns unit vectors', async () => {
  const calls = [];
  const importer = async () => ({
    pipeline: async (task, model) => {
      calls.push([task, model]);
      return async (batch) => ({ dims: [batch.length, 2], data: Float32Array.from(batch.flatMap(() => [0.6, 0.8])) });
    },
  });
  const e = await createEmbedder({ importer });
  const out = await e.embed(['a', 'b', 'c']);
  assert.deepEqual(calls, [['feature-extraction', 'Xenova/all-MiniLM-L6-v2']]);
  assert.equal(out.length, 3);
  assert.ok(Math.abs(Math.hypot(...out[0]) - 1) < 1e-6);
});

test('createEmbedder passes on a failed download', async () => {
  const importer = async () => {
    throw new Error('offline');
  };
  await assert.rejects(createEmbedder({ importer }), /offline/);
});

// "Smarter search": the same answers, but passages and sentences are matched by meaning
// (sentence embeddings) as well as by words, so "how hot" finds "250 degrees".
// The embedder is passed in: see embed.js for the real one, tests use a stand-in.
import { queryTerms, answerBonus, source, refusal } from './answer.js';

// Below this cosine similarity between the question and the best passage we refuse.
// Tuned with scripts/eval.js on the sample guide (see README).
export const MIN_SIMILARITY = 0.3;

const RRF_K = 60; // reciprocal-rank fusion constant
const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const chunkText = (c) => (c.heading ? `${c.heading}. ${c.text}` : c.text);

// Embeds every passage once; the vectors are stored on the index.
export async function embedIndex(index, embedder, { onProgress } = {}) {
  const texts = index.chunks.map(chunkText);
  const vectors = [];
  const step = 32;
  for (let i = 0; i < texts.length; i += step) {
    vectors.push(...(await embedder.embed(texts.slice(i, i + step))));
    if (onProgress) onProgress(Math.min(i + step, texts.length), texts.length);
  }
  index.vectors = vectors;
  index.model = embedder.model;
  return index;
}

// Rank positions (0 = best) for the given scores, highest first.
const ranks = (scores) => {
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const r = new Array(scores.length);
  order.forEach(([, i], pos) => (r[i] = pos));
  return r;
};

export async function askSmart(index, question, embedder, { show = 3, fuse = 4 } = {}) {
  if (!index.vectors) throw new Error('call embedIndex() before askSmart()');
  const terms = queryTerms(question);
  if (!question.trim()) return refusal('EMPTY', 'Ask a more specific question, for example "How long should the dough rest?"');

  const [qv] = await embedder.embed([question]);
  const sims = index.vectors.map((v) => dot(qv, v));

  // Fuse the meaning-based ranking with the word-based one: either can rescue the other.
  const semanticRank = ranks(sims);
  const lexical = new Map(index.bm25.search(terms, index.chunks.length).map((h, pos) => [h.index, pos]));
  const fused = index.chunks
    .map((_, i) => ({ i, score: 1 / (RRF_K + semanticRank[i]) + (lexical.has(i) ? 1 / (RRF_K + lexical.get(i)) : 0) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, fuse);

  const bestSim = Math.max(...fused.map((f) => sims[f.i]));
  const closest = fused.reduce((a, b) => (sims[b.i] > sims[a.i] ? b : a));
  if (!(bestSim >= MIN_SIMILARITY)) {
    return refusal('LOW_SIMILARITY', "I couldn't find a clear answer to that in this document. The closest passage is shown below.", [
      source(index.chunks[closest.i], sims[closest.i], terms),
    ]);
  }

  // Choose the answer sentence by meaning, with the same "how long wants a number" nudge.
  const cands = [];
  for (const { i } of fused.slice(0, 3)) {
    index.chunks[i].sentences.forEach((text, s) => cands.push({ chunk: i, s, text }));
  }
  const vecs = await embedder.embed(cands.map((c) => c.text));
  cands.forEach((c, n) => (c.score = dot(qv, vecs[n]) + 0.5 * answerBonus(question, c.text)));
  const best = cands.reduce((a, b) => (b.score > a.score ? b : a));

  const chunk = index.chunks[best.chunk];
  // include a neighbouring sentence when it is nearly as relevant
  const neighbour = cands
    .filter((c) => c.chunk === best.chunk && Math.abs(c.s - best.s) === 1 && c.score >= best.score - 0.1)
    .sort((a, b) => b.score - a.score)[0];
  const [from, to] = neighbour ? [Math.min(best.s, neighbour.s), Math.max(best.s, neighbour.s)] : [best.s, best.s];

  const sentenceSim = dot(qv, vecs[cands.indexOf(best)]);
  const ordered = [fused.find((f) => f.i === best.chunk), ...fused.filter((f) => f.i !== best.chunk)].slice(0, show);
  return {
    status: 'answer',
    mode: 'smart',
    answer: chunk.sentences.slice(from, to + 1).join(' '),
    confidence: sentenceSim >= 0.6 ? 'high' : sentenceSim >= 0.45 ? 'medium' : 'low',
    coverage: Math.round(sentenceSim * 100) / 100,
    page: chunk.page,
    sources: ordered.map((f) => source(index.chunks[f.i], sims[f.i], terms)),
  };
}

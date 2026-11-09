// "Smarter search": the same answers, but passages and sentences are matched by meaning
// (sentence embeddings) as well as by words, so "how hot" finds "250 degrees".
// The embedder is passed in: see embed.js for the real one, tests use a stand-in.
import { queryTerms, pickSentences, termWeights, source, refusal, MIN_COVERAGE } from './answer.js';

// Below this cosine similarity between the question and the best sentence (and with too few
// matching words) we refuse.
// Tuned with scripts/eval.js on the sample guide (see README).
export const MIN_SIMILARITY = 0.3;

// How much the meaning score counts next to the word-overlap score when choosing the sentence.
const MEANING_WEIGHT = 1;
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

export async function askSmart(index, question, embedder, { show = 3, fuse = 5, meaningWeight = MEANING_WEIGHT, minSimilarity = MIN_SIMILARITY } = {}) {
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

  // Choose the answer sentence with the classic word-overlap scoring plus a meaning score.
  const vectors = new Map();
  for (const { i } of fused) {
    const chunk = index.chunks[i];
    const texts = chunk.sentences.map((t) => (chunk.heading ? `${chunk.heading}. ${t}` : t));
    vectors.set(i, await embedder.embed(texts));
  }
  const meaning = (hit, from, to) => {
    let best = 0;
    for (let s = from; s <= to; s++) best = Math.max(best, dot(qv, vectors.get(hit.index)[s]));
    return best;
  };
  const hits = fused.map((f) => ({ index: f.i, score: sims[f.i] }));
  const pick = pickSentences(index, hits, terms, termWeights(index, terms), question, (hit, from, to) => meaningWeight * meaning(hit, from, to));

  const sentenceSim = meaning(pick.hit, pick.from, pick.to);
  // Refuse only when neither the meaning nor the words of the best sentence match the question.
  if (sentenceSim < minSimilarity && pick.cov < MIN_COVERAGE) {
    return refusal('LOW_SIMILARITY', "I couldn't find a clear answer to that in this document. The closest passage is shown below.", [
      source(pick.chunk, sims[pick.hit.index], terms),
    ]);
  }
  const ordered = [pick.hit, ...hits.filter((h) => h.index !== pick.hit.index)].slice(0, show);
  return {
    status: 'answer',
    mode: 'smart',
    answer: pick.chunk.sentences.slice(pick.from, pick.to + 1).join(' '),
    confidence: sentenceSim >= 0.6 ? 'high' : sentenceSim >= 0.45 ? 'medium' : 'low',
    coverage: Math.round(sentenceSim * 100) / 100,
    lexical: Math.round(pick.cov * 100) / 100,
    page: pick.chunk.page,
    sources: ordered.map((h) => source(index.chunks[h.index], h.score, terms)),
  };
}

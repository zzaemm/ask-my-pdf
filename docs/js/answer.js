// Question answering over a document, using only classic search:
// BM25 picks the best passages, then the sentence that covers the most question
// terms is returned as the answer, with its page number. If the document does not
// really cover the question, it says so instead of guessing.
import { tokenize, stem } from './tokenize.js';
import { BM25 } from './bm25.js';
import { chunkPages } from './chunker.js';

// Words that make a question a question without saying what it is about.
const QUESTION_FILLER = new Set(
  'long much many take takes need needs use used kind type mean means tell explain describe get way please tip tips'.split(' ')
);

// Below this share of the question's (weighted) terms found in the best passage, we refuse.
// Exactly half the terms missing (e.g. "bread" and "loaf" match but "London" and "cost" do not)
// means the document is about something else, so 0.5 itself is not enough.
export const MIN_COVERAGE = 0.55;

const NUMBER = /\b(\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|dozen|hundred)\b/i;
const TIME_UNIT = /\b(seconds?|minutes?|hours?|days?|weeks?|months?|years?|overnight)\b/i;
const NUMERIC_Q = /\bhow (long|much|many|hot|cold|often|far|big|heavy|old|tall|deep|high)\b|\bwhat (temperature|amount|size|percent(age)?|weight|quantity|number)\b|\bwhen\b/i;
const DURATION_Q = /\bhow (long|often)\b|\bwhen\b|\bhow (many|much) (seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/i;

// Questions like "how long" are answered by a sentence with a number (and a time unit).
export function answerBonus(question, text) {
  let bonus = 0;
  if (NUMERIC_Q.test(question) && NUMBER.test(text)) {
    bonus += 0.3;
    if (DURATION_Q.test(question) && TIME_UNIT.test(text)) bonus += 0.15;
  }
  return bonus;
}

export function buildIndex(pages, options) {
  const chunks = chunkPages(pages, options);
  const bm25 = new BM25(chunks.map((c) => tokenize(`${c.heading} ${c.text}`)));
  return { chunks, bm25 };
}

export function queryTerms(question) {
  return [...new Set(tokenize(question, { extraStopwords: QUESTION_FILLER }))];
}

// The filler words are not required, but a sentence that echoes one ("takes" for
// "how long does it take") is a slightly better answer.
function hintTerms(question) {
  const words = question.toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) || [];
  return [...new Set(words.filter((w) => QUESTION_FILLER.has(w)).map(stem))];
}

// Rare terms matter more. A term that never occurs in the document counts as an
// average term, so asking about something the document lacks lowers the coverage.
export function termWeights(index, terms) {
  const known = terms.filter((t) => index.bm25.df.has(t));
  const fallback = known.length ? known.reduce((s, t) => s + index.bm25.idf(t), 0) / known.length : 1;
  return new Map(terms.map((t) => [t, index.bm25.df.has(t) ? index.bm25.idf(t) : fallback]));
}

function coverage(tokenSet, terms, weights) {
  let have = 0;
  let all = 0;
  for (const t of terms) {
    const w = weights.get(t);
    all += w;
    if (tokenSet.has(t)) have += w;
  }
  return all ? have / all : 0;
}

// Character ranges of words in `text` that match a question term, for highlighting.
export function highlightRanges(text, terms) {
  const wanted = new Set(terms);
  const ranges = [];
  for (const m of text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
    if (wanted.has(stem(m[0].toLowerCase()))) ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

export const source = (chunk, score, terms) => ({
  chunkId: chunk.id,
  page: chunk.page,
  heading: chunk.heading,
  text: chunk.text,
  score: Math.round(score * 100) / 100,
  highlights: highlightRanges(chunk.text, terms),
  headingHighlights: highlightRanges(chunk.heading, terms),
});

export const refusal = (reason, message, sources = []) => ({ status: 'no_answer', reason, message, sources });

// Best one- or two-sentence window across the top passages. Sentences count the
// words of their section heading too, since "Bulk fermentation" above a paragraph
// is part of what its sentences are about.
// `extra(hit, from, to)` can add to a window's score; the smarter search uses it for meaning.
export function pickSentences(index, hits, terms, weights, question = '', extra = () => 0) {
  const hints = hintTerms(question);
  let best = null;
  hits.forEach((hit, rank) => {
    const chunk = index.chunks[hit.index];
    const heading = tokenize(chunk.heading);
    const sets = chunk.sentences.map((s) => new Set([...tokenize(s), ...heading]));
    chunk.sentences.forEach((_, i) => {
      for (const [from, to] of [[i, i], [i, i + 1], [i - 1, i]]) {
        if (from < 0 || to >= sets.length) continue;
        const cov = coverage(new Set(sets.slice(from, to + 1).flatMap((s) => [...s])), terms, weights);
        const text = chunk.sentences.slice(from, to + 1).join(' ');
        const words = new Set(tokenize(text, { keepStopwords: true }));
        const echoed = Math.min(2, hints.filter((h) => words.has(h)).length);
        // a second sentence must earn its place: it costs a little
        const score = cov + answerBonus(question, text) + 0.1 * echoed - 0.05 * (to - from) + extra(hit, from, to);
        // a better-ranked passage breaks ties
        if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && rank < best.rank)) {
          best = { from, to, cov, score, hit, rank, chunk };
        }
      }
    });
  });
  return best;
}

// The answer sentence is searched for in the best `candidates` passages, because BM25
// favours short passages and the best answer can sit in a longer one ranked a little lower.
export function ask(index, question, { candidates = 5, show = 3 } = {}) {
  const terms = queryTerms(question);
  if (!terms.length) return refusal('EMPTY', 'Ask a more specific question, for example "How long should the dough rest?"');

  const hits = index.bm25.search(terms, candidates);
  if (!hits.length) return refusal('NO_MATCH', "I couldn't find anything about that in this document.");

  const weights = termWeights(index, terms);
  const top = index.chunks[hits[0].index];
  const topCoverage = coverage(new Set(tokenize(`${top.heading} ${top.text}`)), terms, weights);
  if (topCoverage < MIN_COVERAGE) {
    return refusal('LOW_COVERAGE', "I couldn't find a clear answer to that in this document. The closest passage is shown below.", [
      source(top, hits[0].score, terms),
    ]);
  }

  const pick = pickSentences(index, hits, terms, weights, question);
  const answer = pick.chunk.sentences.slice(pick.from, pick.to + 1).join(' ');
  const ordered = [pick.hit, ...hits.filter((h) => h.index !== pick.hit.index)].slice(0, show);
  return {
    status: 'answer',
    answer,
    confidence: pick.cov >= 0.75 ? 'high' : pick.cov >= 0.5 ? 'medium' : 'low',
    coverage: Math.round(pick.cov * 100) / 100,
    page: pick.chunk.page,
    sources: ordered.map((h) => source(index.chunks[h.index], h.score, terms)),
  };
}

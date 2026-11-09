// Okapi BM25 ranking over pre-tokenized documents.

export class BM25 {
  constructor(docs, { k1 = 1.5, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.n = docs.length;
    this.lengths = docs.map((d) => d.length);
    this.avgLen = this.n ? this.lengths.reduce((a, c) => a + c, 0) / this.n : 0;
    this.tf = docs.map((tokens) => {
      const m = new Map();
      for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
      return m;
    });
    this.df = new Map();
    for (const m of this.tf) for (const t of m.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }

  // The +1 inside the log keeps idf positive even for terms that appear in most documents.
  idf(term) {
    const df = this.df.get(term) || 0;
    return Math.log(1 + (this.n - df + 0.5) / (df + 0.5));
  }

  score(queryTokens, index) {
    const tf = this.tf[index];
    const norm = 1 - this.b + this.b * (this.avgLen ? this.lengths[index] / this.avgLen : 1);
    let s = 0;
    for (const t of new Set(queryTokens)) {
      const f = tf.get(t);
      if (f) s += this.idf(t) * ((f * (this.k1 + 1)) / (f + this.k1 * norm));
    }
    return s;
  }

  // Best-first list of {index, score}; documents that match nothing are left out.
  search(queryTokens, k = 5) {
    const hits = [];
    for (let i = 0; i < this.n; i++) {
      const score = this.score(queryTokens, i);
      if (score > 0) hits.push({ index: i, score });
    }
    return hits.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, k);
  }
}

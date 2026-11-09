# Ask my PDF

Drop in a PDF, ask a question in plain English, and get the answer with the page it came from.
Everything runs in your browser. The file is never uploaded, and there is no account, server or API key.

**Live demo: https://zzaemm.github.io/ask-my-pdf/** (use the "Try the sample" button to see it work straight away)

## What it does

- Reads the text of a PDF (up to 100 MB / 500 pages), rebuilding paragraphs and headings.
- Answers with the single best sentence, its page number, a confidence label and the passages it came from, with your question's words highlighted.
- Says "I couldn't find that" when the document doesn't cover the question, and shows the closest passage anyway.
- Optional **smarter search**: a small language model (MiniLM, 23 MB) that runs in the browser and understands different wording ("how hot" finds "250 degrees"). It is off by default and only downloaded if you turn it on.
- Works on a phone, follows the system light/dark theme and can be used with a keyboard.

## How it works

1. **Extract**: pdf.js gives text fragments with positions. They are grouped into lines, paragraphs and headings, and words split by hyphens at line ends are rejoined (`docs/js/pdf-text.js`).
2. **Chunk**: text is split into passages of about 80 words that never cross a page or a heading (`chunker.js`).
3. **Retrieve**: passages are ranked with Okapi BM25 over lightly stemmed words (`tokenize.js`, `bm25.js`).
4. **Answer**: the best one- or two-sentence window across the top passages is chosen, counting rare question words more, giving "how long" questions a nudge towards sentences with a number and a time unit, and counting the section heading as part of each sentence (`answer.js`).
5. **Refuse**: if too few of the question's (weighted) words appear in the best passage, it says so instead of guessing.
6. **Smarter search** (optional): passages and sentences are also embedded with `all-MiniLM-L6-v2` through [transformers.js](https://github.com/huggingface/transformers.js). Meaning-based and word-based rankings are fused, and the sentence is chosen with both scores (`embed.js`, `smart.js`).

There is no build step: the site is plain ES modules in `docs/`, and pdf.js is vendored so the default mode works offline.

## How good is it?

Measured on the included 4-page sourdough guide with `npm run eval`. The first set of questions is the one I used while building and tuning the answer engine, so it flatters classic search. The second set was written afterwards and never used for tuning.

| | Classic (default) | Smarter search |
|---|---|---|
| Questions used while tuning (14) | 14 / 14 | 13 / 14 |
| Fresh wordings, held out (12) | 6 / 12 | 9 / 12 |
| Off-topic questions refused (5) | 5 / 5 | 4 / 5 |

An answer counts as correct when it contains the expected phrase and comes from the right page.

What this says, and does not say:

- Classic search is excellent when the question shares words with the answer and weak when it is phrased differently. Smarter search fixes many of those but not all.
- The smarter mode lets one off-topic question through: it answered "How much does a loaf of bread cost in London?" with the recipe sentence, because the question is about bread. Small embedding models cannot tell "near the topic" from "answers the question". Treat the confidence label as a hint, and read the highlighted source.
- It is a tiny test set on one document. It shows the trade-offs, it is not a benchmark.
- It finds the best existing sentence. It does not write new answers, combine facts from several places or do arithmetic.

## Limits

- Scanned PDFs have no text to read. The page says so instead of failing quietly (no OCR here).
- Tables and multi-column layouts are read line by line, so answers from tables can come out jumbled.
- Smarter search needs a connection the first time (library from jsDelivr, model from the Hugging Face hub), then works from the browser cache. If the download fails the page falls back to classic search.
- The smarter-search path is verified in a desktop browser and in Node, but not on every phone or browser.

## Run it yourself

```bash
npm install
npm test          # 91 tests, no network needed
npm run serve     # http://localhost:8080
```

To reproduce the accuracy table (downloads the model on first run):

```bash
npm install --no-save @huggingface/transformers
npm run eval
```

## Project layout

```
docs/                 the site (served by GitHub Pages)
  index.html, style.css
  js/                 tokenize, bm25, chunker, pdf-text, answer, embed, smart, app, main
  vendor/pdfjs/       pdf.js (Apache-2.0)
  sample/             the sample PDF
tests/                node:test suites; jsdom for the page
scripts/              eval.js (accuracy table), serve.js (local server)
```

## Licence

MIT. See `LICENSE`, and `THIRD_PARTY_NOTICES.md` for pdf.js, transformers.js and the model.

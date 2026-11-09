// The page: choose a PDF, read it, ask questions. Everything it depends on is passed in
// (see main.js), so the tests can run it in jsdom without a real PDF reader or model.
import { buildIndex, ask } from './answer.js';
import { embedIndex, askSmart } from './smart.js';

const MAX_BYTES = 100 * 1024 * 1024;

// Text with the given character ranges wrapped in <mark>. Built from DOM nodes, never HTML strings.
export function highlighted(doc, text, ranges = []) {
  const frag = doc.createDocumentFragment();
  let at = 0;
  for (const { start, end } of ranges) {
    if (start < at) continue;
    if (start > at) frag.append(text.slice(at, start));
    const mark = doc.createElement('mark');
    mark.textContent = text.slice(start, end);
    frag.append(mark);
    at = end;
  }
  if (at < text.length) frag.append(text.slice(at));
  return frag;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function mountApp(doc, deps) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    drop: $('drop'), file: $('file'), pick: $('pick'), sample: $('sample'), change: $('change'),
    status: $('status'), progress: $('progress'), loaded: $('loaded'), docname: $('docname'), docinfo: $('docinfo'),
    smart: $('smart'), qa: $('qa'), form: $('ask'), q: $('q'), answers: $('answers'),
  };
  const state = { index: null, embedder: null, busy: false };

  function setStatus(text, kind = '') {
    el.status.textContent = text;
    el.status.className = kind;
  }
  function setProgress(fraction) {
    el.progress.hidden = fraction == null;
    if (fraction != null) el.progress.value = Math.round(fraction * 100);
  }
  function setBusy(busy) {
    state.busy = busy;
    el.form.querySelector('button').disabled = busy;
    el.pick.disabled = busy;
    el.sample.disabled = busy;
  }

  async function openDocument(data, name) {
    setBusy(true);
    state.index = null;
    el.qa.hidden = true;
    el.loaded.hidden = true;
    el.answers.replaceChildren();
    setStatus('Reading the document…');
    setProgress(0);
    try {
      const pdfjs = await deps.loadPdfjs();
      const result = await deps.extractPages(data, pdfjs, { onProgress: (done, total) => setProgress(done / total) });
      const readable = result.pages.length - result.lowTextPages.length;
      if (readable === 0) {
        setStatus('This PDF has no selectable text. It is probably a scan, so there is nothing to search.', 'error');
        return;
      }
      state.index = buildIndex(result.pages);
      el.docname.textContent = name;
      el.docinfo.textContent = `${plural(result.numPages, 'page')}, ${plural(state.index.chunks.length, 'passage')}`;
      el.loaded.hidden = false;
      el.qa.hidden = false;
      const notes = [];
      if (result.lowTextPages.length) notes.push(`Skipped ${plural(result.lowTextPages.length, 'page')} without selectable text (page ${result.lowTextPages.join(', ')}).`);
      if (result.truncated) notes.push(`Only the first ${result.pages.length} pages were read.`);
      setStatus(notes.join(' '), notes.length ? 'warn' : '');
      if (el.smart.checked) await enableSmart(notes.length ? el.status.textContent : '');
      el.q.focus();
    } catch (err) {
      setStatus(err.message || 'Could not read this PDF.', 'error');
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setStatus('That does not look like a PDF. Please choose a file ending in .pdf.', 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus(`That file is ${(file.size / 1048576).toFixed(0)} MB. Files up to 100 MB are supported.`, 'error');
      return;
    }
    await openDocument(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  async function enableSmart(keepStatus = '') {
    const index = state.index;
    if (!index || index.vectors) return;
    const wasBusy = state.busy;
    setBusy(true);
    try {
      if (!state.embedder) {
        setStatus('Downloading the search model (first time only)…');
        state.embedder = await deps.createEmbedder({
          onProgress: (p) => p && p.status === 'progress' && typeof p.progress === 'number' && setProgress(p.progress / 100),
        });
      }
      setStatus('Preparing the document for smarter search…');
      setProgress(0);
      await embedIndex(index, state.embedder, { onProgress: (done, total) => setProgress(done / total) });
      setStatus(keepStatus || 'Smarter search is on.');
    } catch (err) {
      el.smart.checked = false;
      setStatus("Couldn't load the smarter search (are you offline?). Using the normal search instead.", 'warn');
    } finally {
      setProgress(null);
      if (!wasBusy) setBusy(false);
    }
  }

  function sourceNode(src) {
    const wrap = doc.createElement('div');
    wrap.className = 'source';
    const h = doc.createElement('h3');
    h.append(`Page ${src.page}`);
    if (src.heading) h.append(' · ', highlighted(doc, src.heading, src.headingHighlights));
    const p = doc.createElement('p');
    p.append(highlighted(doc, src.text, src.highlights));
    wrap.append(h, p);
    return wrap;
  }

  function addCard(question, result) {
    const li = doc.createElement('li');
    li.className = 'card' + (result.status === 'answer' ? '' : ' refused');
    const q = doc.createElement('p');
    q.className = 'q';
    q.textContent = question;
    const a = doc.createElement('p');
    a.className = 'a';
    a.textContent = result.status === 'answer' ? result.answer : result.message;
    li.append(q, a);

    if (result.status === 'answer') {
      const meta = doc.createElement('p');
      meta.className = 'meta';
      const chip = (text, cls = '') => {
        const c = doc.createElement('span');
        c.className = 'chip ' + cls;
        c.textContent = text;
        meta.append(c);
      };
      chip(`Page ${result.page}`);
      chip(`${result.confidence} confidence`, result.confidence === 'low' ? 'low' : '');
      if (result.mode === 'smart') chip('smarter search');
      li.append(meta);
    }
    if (result.sources.length) {
      const details = doc.createElement('details');
      const summary = doc.createElement('summary');
      summary.textContent = result.status === 'answer' ? 'Where this comes from' : 'Closest passage';
      details.append(summary, ...result.sources.map(sourceNode));
      li.append(details);
    }
    el.answers.prepend(li);
  }

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = el.q.value.trim();
    if (!question || !state.index || state.busy) return;
    const useSmart = el.smart.checked && state.index.vectors;
    setBusy(true);
    try {
      addCard(question, useSmart ? await askSmart(state.index, question, state.embedder) : ask(state.index, question));
      el.q.value = '';
    } catch (err) {
      setStatus(`Something went wrong while searching (${err.message}).`, 'error');
    } finally {
      setBusy(false);
      el.q.focus();
    }
  });

  el.smart.addEventListener('change', () => {
    if (el.smart.checked) enableSmart();
    else if (state.index) setStatus('');
  });

  el.pick.addEventListener('click', () => el.file.click());
  el.file.addEventListener('change', () => {
    const file = el.file.files[0];
    el.file.value = '';
    handleFile(file);
  });
  el.change.addEventListener('click', () => el.file.click());
  el.sample.addEventListener('click', async () => {
    try {
      await openDocument(await deps.fetchSample(), 'sourdough-guide.pdf');
    } catch (err) {
      setStatus("Couldn't load the sample file.", 'error');
    }
  });

  for (const type of ['dragenter', 'dragover']) {
    el.drop.addEventListener(type, (e) => {
      e.preventDefault();
      el.drop.classList.add('over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    el.drop.addEventListener(type, (e) => {
      e.preventDefault();
      el.drop.classList.remove('over');
    });
  }
  el.drop.addEventListener('drop', (e) => handleFile(e.dataTransfer && e.dataTransfer.files[0]));

  return { state, openDocument, handleFile };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { mountApp, highlighted } from '../docs/js/app.js';
import { extractPages } from '../docs/js/pdf-text.js';
import { fixture, loadPdfjs, fakeEmbedder } from './helpers.js';

const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>/, '');
const pdfjs = await loadPdfjs();

function setup(overrides = {}) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const deps = {
    loadPdfjs: async () => pdfjs,
    extractPages,
    createEmbedder: async () => fakeEmbedder,
    fetchSample: async () => fixture('sourdough-guide.pdf'),
    ...overrides,
  };
  const app = mountApp(document, deps);
  const $ = (id) => document.getElementById(id);
  const settle = async () => {
    while ($('ask').querySelector('button').disabled) await new Promise((r) => setTimeout(r, 5));
  };
  const click = async (id) => {
    $(id).click();
    await new Promise((r) => setTimeout(r, 5));
    await settle();
  };
  const ask = async (q) => {
    $('q').value = q;
    $('ask').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 5));
    await settle();
  };
  return { dom, document, app, $, click, ask };
}

test('the question box stays hidden until a document is loaded', () => {
  const { $ } = setup();
  assert.equal($('qa').hidden, true);
  assert.equal($('loaded').hidden, true);
});

test('opening the sample shows the document and the question box', async () => {
  const { $, click } = setup();
  await click('sample');
  assert.equal($('qa').hidden, false);
  assert.equal($('docname').textContent, 'sourdough-guide.pdf');
  assert.match($('docinfo').textContent, /4 pages/);
  assert.equal($('progress').hidden, true);
});

test('a question gets an answer card with the page and highlighted sources', async () => {
  const { $, click, ask, document } = setup();
  await click('sample');
  await ask('How long should I cold proof the dough?');
  const card = $('answers').firstElementChild;
  assert.match(card.querySelector('.a').textContent, /12 to 16 hours/);
  assert.ok([...card.querySelectorAll('.chip')].some((c) => c.textContent === 'Page 3'));
  assert.ok(card.querySelectorAll('details mark').length > 0);
  assert.equal($('q').value, '');
  assert.equal(document.activeElement, $('q'));
});

test('newest answers appear first', async () => {
  const { $, click, ask } = setup();
  await click('sample');
  await ask('How much salt do I need?');
  await ask('How should I store the loaf?');
  assert.match($('answers').children[0].querySelector('.q').textContent, /store/);
  assert.equal($('answers').children.length, 2);
});

test('an off-topic question is refused and shows the closest passage', async () => {
  const { $, click, ask } = setup();
  await click('sample');
  await ask('Who won the football world cup in 2018?');
  const card = $('answers').firstElementChild;
  assert.ok(card.classList.contains('refused'));
  assert.equal(card.querySelectorAll('.chip').length, 0);
});

test('an empty question does nothing', async () => {
  const { $, click, ask } = setup();
  await click('sample');
  await ask('   ');
  assert.equal($('answers').children.length, 0);
});

test('question text is shown as text, never as HTML', async () => {
  const { $, click, ask, document } = setup();
  await click('sample');
  await ask('<img src=x onerror=alert(1)> how much salt?');
  assert.equal(document.querySelector('#answers img'), null);
  assert.match($('answers').querySelector('.q').textContent, /<img/);
});

test('a PDF without selectable text is explained, and nothing can be asked', async () => {
  const { $, click } = setup({ fetchSample: async () => fixture('blank-page.pdf') });
  await click('sample');
  assert.match($('status').textContent, /no selectable text/);
  assert.equal($('status').className, 'error');
  assert.equal($('qa').hidden, true);
});

test('something that is not a PDF is turned away before reading', async () => {
  const { $, app } = setup();
  await app.handleFile({ name: 'notes.txt', type: 'text/plain', size: 10 });
  assert.match($('status').textContent, /does not look like a PDF/);
});

test('a huge file is turned away with its size', async () => {
  const { $, app } = setup();
  await app.handleFile({ name: 'big.pdf', type: 'application/pdf', size: 300 * 1048576 });
  assert.match($('status').textContent, /300 MB/);
});

test('a broken PDF gives a readable error', async () => {
  const { $, app } = setup();
  await app.openDocument(new Uint8Array([1, 2, 3, 4]), 'broken.pdf');
  assert.equal($('status').className, 'error');
  assert.ok($('status').textContent.length > 10);
  assert.equal($('qa').hidden, true);
});

test('opening a new document clears the earlier answers', async () => {
  const { $, click, ask } = setup();
  await click('sample');
  await ask('How much salt do I need?');
  await click('sample');
  assert.equal($('answers').children.length, 0);
});

test('smarter search: turning it on prepares the document, and answers say so', async () => {
  const { $, click, ask, dom } = setup();
  await click('sample');
  $('smart').checked = true;
  $('smart').dispatchEvent(new dom.window.Event('change'));
  await new Promise((r) => setTimeout(r, 30));
  while ($('ask').querySelector('button').disabled) await new Promise((r) => setTimeout(r, 5));
  assert.equal($('status').textContent, 'Smarter search is on.');
  await ask('How much salt do I need?');
  assert.ok([...$('answers').firstElementChild.querySelectorAll('.chip')].some((c) => c.textContent === 'smarter search'));
});

test('smarter search: if the model cannot be loaded, the checkbox clears and normal search still works', async () => {
  const { $, click, ask, dom } = setup({
    createEmbedder: async () => {
      throw new Error('offline');
    },
  });
  await click('sample');
  $('smart').checked = true;
  $('smart').dispatchEvent(new dom.window.Event('change'));
  await new Promise((r) => setTimeout(r, 30));
  while ($('ask').querySelector('button').disabled) await new Promise((r) => setTimeout(r, 5));
  assert.equal($('smart').checked, false);
  assert.match($('status').textContent, /offline/);
  assert.equal($('status').className, 'warn');
  await ask('How much salt do I need?');
  assert.match($('answers').firstElementChild.querySelector('.a').textContent, /10 grams of salt/);
});

test('highlighted() wraps only the given ranges', () => {
  const { document } = new JSDOM('').window;
  const div = document.createElement('div');
  div.append(highlighted(document, 'Bake the loaf now', [{ start: 0, end: 4 }, { start: 9, end: 13 }]));
  assert.equal(div.innerHTML, '<mark>Bake</mark> the <mark>loaf</mark> now');
  const none = document.createElement('div');
  none.append(highlighted(document, 'plain <b>text</b>', []));
  assert.equal(none.innerHTML, 'plain &lt;b&gt;text&lt;/b&gt;');
});

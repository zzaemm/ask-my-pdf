// Turns text into lowercase word stems for matching. Both the question and the
// document go through the same steps, so "rising", "rises" and "rise" all meet.

const STOPWORDS = new Set(`a about above after again all also am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further had has have having he her
here hers him his how i if in into is it its just me more most my no nor not of off on once only or other our out over
own same she should so some such than that the their them then there these they this those through to too under until
up very was we were what when where which while who whom why will with would you your yours`.split(/\s+/));

// \p{M} keeps vowel signs attached, otherwise Malayalam/Hindi/Tamil words split into pieces.
const WORD = /[\p{L}\p{N}\p{M}]+/gu;

const undouble = (w) => (/([^aeiou])\1$/.test(w) ? w.slice(0, -1) : w);

// A deliberately small suffix stripper. Not a full Porter stemmer: it only has to be
// consistent, since the same function is applied to questions and documents.
export function stem(word) {
  let w = word;
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/sses$/.test(w)) w = w.slice(0, -2);
  else if (/[^su]s$/.test(w) && !/(ss|is)$/.test(w)) w = w.slice(0, -1);
  if (/ing$/.test(w) && w.length > 5) w = undouble(w.slice(0, -3));
  else if (/ed$/.test(w) && w.length > 4) w = undouble(w.slice(0, -2));
  if (/e$/.test(w) && w.length > 3) w = w.slice(0, -1);
  return w;
}

export function tokenize(text, { keepStopwords = false, extraStopwords = null } = {}) {
  const out = [];
  for (const m of String(text).toLowerCase().matchAll(WORD)) {
    const w = m[0];
    if (!keepStopwords && STOPWORDS.has(w)) continue;
    if (extraStopwords && extraStopwords.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

export const isStopword = (w) => STOPWORDS.has(w.toLowerCase());

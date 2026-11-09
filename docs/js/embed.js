// Optional "smarter search": a small sentence-embedding model that runs in the browser.
// Nothing is downloaded unless the user turns this on. The library comes from a CDN and the
// model (about 23 MB) from the Hugging Face hub, then both are cached by the browser.
// No account, key or server is involved: the text of your PDF never leaves your device.

export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
export const MODEL = 'Xenova/all-MiniLM-L6-v2';
const BATCH = 16;

// `importer` and `model` can be replaced, which is how the tests run without a network.
export async function createEmbedder({ onProgress, importer = (url) => import(url), model = MODEL, url = TRANSFORMERS_URL } = {}) {
  const { pipeline } = await importer(url);
  const extractor = await pipeline('feature-extraction', model, { progress_callback: onProgress });

  return {
    model,
    // Returns one unit-length Float32Array per text, so a dot product is the cosine similarity.
    async embed(texts) {
      const out = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const batch = texts.slice(i, i + BATCH);
        const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
        const dim = tensor.dims[1];
        for (let j = 0; j < batch.length; j++) out.push(Float32Array.from(tensor.data.subarray(j * dim, (j + 1) * dim)));
      }
      return out;
    },
  };
}

// lib/batchProcessor.js
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push({ index: Math.floor(i / size), items: arr.slice(i, i + size), startPage: i });
  }
  return chunks;
}

export async function processBatches(images, { batchSize = 4, concurrency = 4, onProgress } = {}) {
  const chunks = chunkArray(images, batchSize);
  const results = new Array(chunks.length);
  let doneBatches = 0;
  let donePages = 0;
  const queue = [...chunks];

  async function worker() {
    while (queue.length > 0) {
      const chunk = queue.shift();
      if (!chunk) break;
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: chunk.items }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Network error' }));
        throw new Error(`Batch ${chunk.index + 1} failed: ${err.error}`);
      }
      const data = await res.json();
      results[chunk.index] = data.results;
      doneBatches++;
      donePages += chunk.items.length;
      if (onProgress) onProgress(donePages, images.length, queue.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, worker);
  await Promise.all(workers);
  return results.flat();
}

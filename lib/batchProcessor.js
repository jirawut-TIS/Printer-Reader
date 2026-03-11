// lib/batchProcessor.js
// Sends image batches to /api/extract with controlled concurrency

/**
 * Split array into chunks of size n
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push({ index: Math.floor(i / size), items: arr.slice(i, i + size), startPage: i });
  }
  return chunks;
}

/**
 * Process all images with parallel batches
 * @param {string[]} images         All base64 images
 * @param {object}  opts
 * @param {number}  opts.batchSize  Pages per API call (default: 4)
 * @param {number}  opts.concurrency Parallel API calls (default: 4)
 * @param {(done: number, total: number, batchesLeft: number) => void} opts.onProgress
 * @returns {Promise<object[]>}     Extracted rows in page order
 */
export async function processBatches(images, { batchSize = 4, concurrency = 4, onProgress } = {}) {
  const chunks = chunkArray(images, batchSize);
  const results = new Array(chunks.length); // preserve order
  let doneBatches = 0;
  let donePages = 0;

  // Semaphore: run at most `concurrency` requests at once
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

      if (onProgress) {
        onProgress(donePages, images.length, queue.length);
      }
    }
  }

  // Launch workers
  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, worker);
  await Promise.all(workers);

  // Flatten results in order
  return results.flat();
}

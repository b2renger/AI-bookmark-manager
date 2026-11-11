/**
 * `sleep` that keeps time while the page is in the background.
 *
 * Browsers throttle timers on the main thread of a hidden page, and the pacing
 * between links is nothing but timers, so a hidden import would crawl. A timer
 * running in a worker is not slowed down in the same way, so the waiting is
 * done there. If a worker cannot be created, this falls back to a plain timer.
 *
 * Once the browser freezes the page altogether, nothing here runs until the
 * page is resumed; see lib/background.ts for what is done about that.
 */

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, () => void>();

function getWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  try {
    const source = 'onmessage = (e) => { setTimeout(() => postMessage(e.data.id), e.data.ms); };';
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = (e: MessageEvent<number>) => {
      const resolve = pending.get(e.data);
      if (resolve) {
        pending.delete(e.data);
        resolve();
      }
    };
    w.onerror = () => {
      // Hand every waiter back to the caller and stop using the worker.
      workerFailed = true;
      worker = null;
      pending.forEach((resolve) => resolve());
      pending.clear();
    };
    worker = w;
  } catch {
    workerFailed = true;
  }
  return worker;
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  const w = getWorker();
  if (!w) return new Promise((resolve) => setTimeout(resolve, ms));
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    w.postMessage({ id, ms });
  });
}

import { parseAnalysis } from '../json';
import { SYSTEM_PROMPT, buildContextPrompt } from '../prompt';
import { AiConfigError, AnalyzeInput, ProviderResult } from '../types';
import { getModelSpec } from './models';
import type { WorkerProgress, WorkerRequest, WorkerResponse } from './protocol';

/**
 * Main-thread side of the on-device (WebGPU) engine.
 *
 * The worker, and with it the multi-megabyte web-llm bundle, is only created
 * the first time a model is loaded, so visitors who never use an on-device
 * model never download it.
 */

/** A first load includes the download, which can be slow on mobile data. */
const LOAD_TIMEOUT_MS = 45 * 60 * 1000;
const INFERENCE_TIMEOUT_MS = 6 * 60 * 1000;

/**
 * Characters of page text given to the model. The offered models have a
 * 4,096-token window that must also hold the instructions and the answer.
 */
const MAX_CONTEXT_CHARS = 5_000;
const MAX_OUTPUT_TOKENS = 450;

/** Flat schema: small models and the grammar engine both do better without unions. */
const WEBGPU_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    publicationDate: { type: 'string' },
    author: { type: 'string' },
    platform: { type: 'string', enum: ['youtube', 'threads', 'twitter', 'github', 'article', 'website'] },
    coverage: { type: 'string', enum: ['full', 'partial', 'none'] },
  },
  required: ['title', 'summary', 'keywords', 'publicationDate', 'author', 'platform', 'coverage'],
});

interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: number;
}

type ProgressListener = (progress: WorkerProgress) => void;

let worker: Worker | null = null;
const pending = new Map<string, Pending>();
const listeners = new Set<ProgressListener>();
let loadedModelId: string | null = null;

function emit(progress: WorkerProgress) {
  listeners.forEach((fn) => fn(progress));
}

export function onWebGPUProgress(fn: ProgressListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function loadedWebGPUModel(): string | null {
  return loadedModelId;
}

function rejectAll(error: Error) {
  pending.forEach((entry) => {
    clearTimeout(entry.timer);
    entry.reject(error);
  });
  pending.clear();
}

function ensureWorker(): Worker {
  if (worker) return worker;

  const w = new Worker(new URL('../../../workers/webllmWorker.ts', import.meta.url), { type: 'module' });

  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const { id, type, progress, data, error, phase } = e.data;
    if (progress) emit(progress);

    // Loading the model is a step toward the answer, not the answer.
    if (phase === 'init' && type !== 'error') return;

    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    if (type === 'error') entry.reject(new Error(error || 'The on-device model failed.'));
    else entry.resolve(data);
  };

  // A crash must reject everything in flight and discard the dead worker, or
  // every later request would hang silently.
  w.onerror = (err) => {
    const message = err.message || 'The on-device model crashed. The device may be out of memory.';
    rejectAll(new Error(message));
    if (worker === w) worker = null;
    loadedModelId = null;
    try {
      w.terminate();
    } catch {
      /* already gone */
    }
    emit({ status: 'error', text: message, progress: 0 });
  };

  worker = w;
  return w;
}

type RequestBody =
  | { type: 'load'; modelId: string }
  | { type: 'generate'; modelId: string; payload: { system: string; user: string; schema: string; maxTokens: number } }
  | { type: 'unload' };

function request<T>(body: RequestBody, timeoutMs: number): Promise<T> {
  const w = ensureWorker();
  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('The on-device model did not respond in time.'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ id, ...body } as WorkerRequest);
  });
}

/** Downloads (first time) and loads a model into GPU memory. */
export async function loadWebGPUModel(modelId: string): Promise<void> {
  if (!getModelSpec(modelId)) throw new AiConfigError('Choose an on-device model in Settings.');
  await request<void>({ type: 'load', modelId }, LOAD_TIMEOUT_MS);
  loadedModelId = modelId;
}

export function unloadWebGPUModel(): void {
  if (!worker) return;
  try {
    worker.postMessage({ id: `unload-${Date.now()}`, type: 'unload' } as WorkerRequest);
    worker.terminate();
  } catch {
    /* already gone */
  }
  worker = null;
  loadedModelId = null;
  rejectAll(new Error('The on-device model was unloaded.'));
}

export async function analyzeWithWebGPU(
  input: AnalyzeInput,
  opts: { modelId: string },
): Promise<ProviderResult> {
  if (!getModelSpec(opts.modelId)) throw new AiConfigError('Choose an on-device model in Settings.');

  const data = await request<{ text: string }>(
    {
      type: 'generate',
      modelId: opts.modelId,
      payload: {
        system: SYSTEM_PROMPT,
        user: buildContextPrompt(input, MAX_CONTEXT_CHARS),
        schema: WEBGPU_SCHEMA,
        maxTokens: MAX_OUTPUT_TOKENS,
      },
    },
    // The first call may include the download.
    loadedModelId === opts.modelId ? INFERENCE_TIMEOUT_MS : LOAD_TIMEOUT_MS,
  );
  loadedModelId = opts.modelId;

  const text = data?.text ?? '';
  if (!text.trim()) throw new Error('The on-device model returned an empty answer.');
  return { analysis: parseAnalysis(text, input.platform) };
}

if (typeof window !== 'undefined') {
  // Free GPU memory on a real teardown only. `pagehide` also fires when a phone
  // user switches apps; killing a download for that would be wrong.
  window.addEventListener('pagehide', (e) => {
    if (e.persisted || pending.size > 0) return;
    unloadWebGPUModel();
  });
}

/**
 * Dedicated Web Worker for in-browser WebGPU inference via @mlc-ai/web-llm.
 *
 * Ported from Strudel-companion's aiWorker. Runs the model off the main thread
 * so loading and generation cannot freeze the page.
 *
 * NOTHING OUTSIDE THIS FILE MAY IMPORT IT: doing so would pull web-llm into
 * the main bundle and evaluate `self.onmessage = ...` in window scope.
 */

import {
  CreateMLCEngine,
  MLCEngine,
  InitProgressReport,
  prebuiltAppConfig,
  type AppConfig,
} from '@mlc-ai/web-llm';
import { getModelSpec } from '../services/ai/webgpu/models';
import { describeLoadFailure, isTransientLoadError } from '../services/ai/webgpu/loadErrors';
import type { WorkerRequest, WorkerResponse } from '../services/ai/webgpu/protocol';

let engine: MLCEngine | null = null;
let loadedModelId: string | null = null;
/** In-flight load. Concurrent requests await this instead of starting another. */
let initPromise: Promise<void> | null = null;

/**
 * Storage backends for the weights, in the order tried.
 *
 * The Cache API path does a single fetch per shard with no retry, so one
 * hiccup on a phone kills the download. A retry genuinely resumes (cached
 * shards are skipped); IndexedDB is the escalation if the Cache API keeps
 * failing, at the cost of restarting the download.
 */
const CACHE_BACKENDS = ['cache', 'indexeddb'] as const;
type CacheBackend = (typeof CACHE_BACKENDS)[number];
const LOAD_ATTEMPTS_PER_BACKEND = 2;

function appConfigFor(backend: CacheBackend): AppConfig {
  return { ...prebuiltAppConfig, cacheBackend: backend } as AppConfig;
}

/** Whether this runtime accepted schema-constrained JSON. `null` until tried. */
let schemaSupported: boolean | null = null;

function send(response: WorkerResponse) {
  self.postMessage(response);
}

async function ensureEngine(modelId: string, reqId: string): Promise<void> {
  if (engine && loadedModelId === modelId) return;

  if (initPromise) {
    await initPromise;
    if (engine && loadedModelId === modelId) return;
  }

  initPromise = (async () => {
    // Switching models: free the previous weights first, or their GPU buffers leak.
    if (engine) {
      try {
        await engine.unload();
      } catch {
        /* best effort */
      }
      engine = null;
      loadedModelId = null;
    }

    send({
      id: reqId,
      type: 'progress',
      phase: 'init',
      progress: { status: 'downloading', text: `Preparing ${modelId}…`, progress: 0.02 },
    });

    const initProgressCallback = (report: InitProgressReport) => {
      send({
        id: reqId,
        type: 'progress',
        phase: 'init',
        progress: { status: 'downloading', text: report.text, progress: report.progress },
      });
    };

    let lastError: unknown = null;
    for (const [backendIndex, backend] of CACHE_BACKENDS.entries()) {
      if (backendIndex > 0) {
        send({
          id: reqId,
          type: 'progress',
          phase: 'init',
          progress: {
            status: 'downloading',
            text: 'Switching storage method and starting the download again…',
            progress: 0.01,
          },
        });
      }
      for (let attempt = 1; attempt <= LOAD_ATTEMPTS_PER_BACKEND; attempt++) {
        try {
          engine = await CreateMLCEngine(modelId, {
            initProgressCallback,
            logLevel: 'WARN',
            appConfig: appConfigFor(backend),
          });
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          if (!isTransientLoadError(err)) throw new Error(describeLoadFailure(err, modelId));
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            throw new Error(describeLoadFailure(err, modelId));
          }
          const moreAttemptsHere = attempt < LOAD_ATTEMPTS_PER_BACKEND;
          const moreBackends = backendIndex < CACHE_BACKENDS.length - 1;
          if (!moreAttemptsHere && !moreBackends) break;
          if (moreAttemptsHere) {
            send({
              id: reqId,
              type: 'progress',
              phase: 'init',
              progress: {
                status: 'downloading',
                text: `The download stalled. Resuming (attempt ${attempt + 1})…`,
                progress: 0.02,
              },
            });
          }
          // A moment for a flaky mobile connection to come back.
          await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        }
      }
      if (engine) break;
    }

    if (!engine) throw new Error(describeLoadFailure(lastError, modelId));
    loadedModelId = modelId;
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

async function generate(
  payload: { system: string; user: string; schema: string; maxTokens: number },
): Promise<string> {
  if (!engine) throw new Error('The on-device model is not loaded.');
  const spec = getModelSpec(loadedModelId || '');

  // Gemma has no system turn; a system role can be rejected outright.
  const messages = spec?.supportsSystemRole === false
    ? [{ role: 'user', content: `${payload.system}\n\n${payload.user}` }]
    : [
        { role: 'system', content: payload.system },
        { role: 'user', content: payload.user },
      ];

  const base = { messages, temperature: 0.15, max_tokens: payload.maxTokens };

  let reply: any;
  if (schemaSupported !== false) {
    try {
      // Constrained decoding: the output cannot be anything but the schema.
      reply = await engine.chat.completions.create({
        ...base,
        response_format: { type: 'json_object', schema: payload.schema },
      } as any);
      schemaSupported = true;
    } catch (err) {
      if (schemaSupported === true) throw err;
      // The runtime refused the schema. Fall back once, for the session.
      schemaSupported = false;
      reply = await engine.chat.completions.create(base as any);
    }
  } else {
    reply = await engine.chat.completions.create(base as any);
  }

  // Each bookmark is independent; do not let earlier turns fill the context.
  try {
    await engine.resetChat();
  } catch {
    /* best effort */
  }

  return String(reply?.choices?.[0]?.message?.content ?? '');
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'unload') {
      if (engine) {
        try {
          await engine.unload();
        } catch {
          /* best effort */
        }
      }
      engine = null;
      loadedModelId = null;
      send({ id: req.id, type: 'ready' });
      return;
    }

    await ensureEngine(req.modelId, req.id);

    if (req.type === 'load') {
      send({
        id: req.id,
        type: 'ready',
        progress: { status: 'ready', text: 'Model ready on this device.', progress: 1 },
      });
      return;
    }

    send({
      id: req.id,
      type: 'progress',
      phase: 'init',
      progress: { status: 'generating', text: 'Writing the summary on this device…', progress: 1 },
    });
    const text = await generate(req.payload);
    send({ id: req.id, type: 'result', data: { text } });
  } catch (err: any) {
    const message = String(err?.message ?? err ?? 'The on-device model failed.');
    send({
      id: req.id,
      type: 'error',
      error: message,
      progress: { status: 'error', text: message, progress: 0 },
    });
  }
};

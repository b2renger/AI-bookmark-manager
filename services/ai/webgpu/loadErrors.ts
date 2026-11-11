/**
 * Classifying and explaining a local-model load failure.
 *
 * Ported from Strudel-companion. Lives outside the worker so it can be
 * imported without pulling in @mlc-ai/web-llm.
 */

/**
 * True for a failure that another attempt could plausibly get past (which is
 * most of them, because the underlying cause is usually one shard's fetch).
 */
export function isTransientLoadError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err ?? '');
  return /cache\.add|network error|failed to fetch|load failed|networkerror|timed? ?out|ERR_|aborted/i.test(
    message,
  );
}

/** Turns a web-llm load failure into something the user can act on. */
export function describeLoadFailure(err: unknown, modelId: string): string {
  const raw = String((err as any)?.message ?? err ?? '');

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return (
      'You are offline, so the model weights cannot be downloaded. Reconnect and try again.'
    );
  }
  if (/cache\.add|network error|failed to fetch|load failed/i.test(raw)) {
    return (
      'The download was interrupted. The weights arrive in dozens of pieces and the browser ' +
      'abandons the whole download if any one of them fails, which is common on mobile data. ' +
      'The pieces that did arrive are kept, so pressing download again picks up where it ' +
      'stopped. Wi-Fi is the reliable way through; a cloud provider needs no download at all.'
    );
  }
  if (/quota|storage/i.test(raw)) {
    return (
      'There is not enough free storage in this browser for the model weights. Pick a smaller model.'
    );
  }
  if (/device|adapter|webgpu|shader/i.test(raw)) {
    return `This device cannot run ${modelId}: ${raw}`;
  }
  return raw || 'The local model failed to load.';
}

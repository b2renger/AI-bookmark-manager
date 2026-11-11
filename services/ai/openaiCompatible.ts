import { errorMessageFrom, requestJson } from './http';
import { parseAnalysis } from './json';
import { ANALYSIS_JSON_SCHEMA, SYSTEM_PROMPT, buildContextPrompt } from './prompt';
import { AiConfigError, AnalyzeInput, ProviderResult } from './types';

/**
 * Any endpoint that speaks the OpenAI chat-completions dialect: Groq,
 * OpenRouter, Mistral, Ollama, LM Studio, or a custom URL.
 *
 * These models cannot fetch pages, so they only ever see the text collected
 * for the URL in the browser.
 */

/** Characters of page text sent. About 3,000 tokens, which fits small free-tier budgets. */
const MAX_CONTEXT_CHARS = 12_000;

type FormatMode = 'json_schema' | 'json_object' | 'none';
const FORMAT_LADDER: FormatMode[] = ['json_schema', 'json_object', 'none'];

/** Structured-output mode that last worked for an endpoint + model. */
const workingFormat = new Map<string, number>();

function trimBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function responseFormat(mode: FormatMode): any {
  if (mode === 'json_schema') {
    return {
      type: 'json_schema',
      json_schema: { name: 'bookmark', strict: true, schema: ANALYSIS_JSON_SCHEMA },
    };
  }
  if (mode === 'json_object') return { type: 'json_object' };
  return undefined;
}

export async function analyzeWithOpenAICompatible(
  input: AnalyzeInput,
  opts: { baseUrl: string; apiKey: string; model: string; label: string },
): Promise<ProviderResult> {
  const base = trimBase(opts.baseUrl);
  if (!base) throw new AiConfigError('Set the endpoint URL in Settings.');
  if (!opts.model) throw new AiConfigError('Choose a model in Settings.');

  const cacheKey = `${base}|${opts.model}`;
  let lastError = '';

  for (let i = workingFormat.get(cacheKey) ?? 0; i < FORMAT_LADDER.length; i++) {
    const body: any = {
      model: opts.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildContextPrompt(input, MAX_CONTEXT_CHARS) },
      ],
    };
    const format = responseFormat(FORMAT_LADDER[i]);
    if (format) body.response_format = format;

    const result = await requestJson(
      `${base}/chat/completions`,
      { method: 'POST', headers: authHeaders(opts.apiKey), body: JSON.stringify(body) },
      { providerLabel: opts.label, timeoutMs: 120_000 },
    );

    if (!result.ok) {
      const message = errorMessageFrom(result);
      if (result.status === 401 || result.status === 403) {
        throw new AiConfigError(`${opts.label} rejected the API key: ${message}`);
      }
      if (result.status === 404) {
        throw new AiConfigError(
          `${opts.label} does not know the model "${opts.model}" (or the endpoint URL is wrong). Check Settings.`,
        );
      }
      if (result.status === 400 || result.status === 422) {
        // Usually an unsupported response_format for this model.
        lastError = message;
        continue;
      }
      throw new Error(`${opts.label} error: ${message}`);
    }

    const content = result.body?.choices?.[0]?.message?.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('')
        : '';
    if (!text.trim()) throw new Error(`${opts.label} returned an empty answer.`);

    workingFormat.set(cacheKey, i);
    return { analysis: parseAnalysis(text, input.platform) };
  }

  throw new Error(`${opts.label} refused the request: ${lastError || 'unknown error'}`);
}

export async function listOpenAICompatibleModels(
  opts: { baseUrl: string; apiKey: string; label: string },
): Promise<string[]> {
  const base = trimBase(opts.baseUrl);
  if (!base) throw new AiConfigError('Set the endpoint URL first.');
  const headers: Record<string, string> = {};
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  const result = await requestJson(
    `${base}/models`,
    { method: 'GET', headers },
    { providerLabel: opts.label, timeoutMs: 20_000 },
  );
  if (!result.ok) {
    const message = errorMessageFrom(result);
    if (result.status === 401 || result.status === 403) {
      throw new AiConfigError(`${opts.label} rejected the API key: ${message}`);
    }
    throw new Error(`Could not load models from ${opts.label}: ${message}`);
  }
  const list: any[] = Array.isArray(result.body?.data)
    ? result.body.data
    : Array.isArray(result.body?.models)
      ? result.body.models
      : [];
  return list
    .map((m) => String(m?.id ?? m?.name ?? ''))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

import { errorMessageFrom, requestJson } from './http';
import { parseAnalysis } from './json';
import { ANALYSIS_GEMINI_SCHEMA, SYSTEM_PROMPT, buildFetchingPrompt, buildContextPrompt } from './prompt';
import { AiConfigError, AnalyzeInput, Evidence, ProviderResult } from './types';

/**
 * Gemini, called straight from the browser with the user's own key.
 *
 * The URL context tool makes Google fetch the page, which is what lets a
 * static site read arbitrary pages without a proxy. Whether the fetch worked
 * is read back from the response and drives the confidence shown to the user.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const LABEL = 'Gemini';

interface CallMode {
  tools: boolean;
  schema: boolean;
}

/**
 * Tried in order; a 400 moves to the next one. Combining built-in tools with a
 * response schema is not accepted by every model, and which models accept it
 * has changed between releases, so this is discovered rather than assumed.
 */
const MODES: CallMode[] = [
  { tools: true, schema: true },
  { tools: true, schema: false },
  { tools: false, schema: true },
];

/** The mode that last worked for a model, so later URLs skip the failed ones. */
const workingMode = new Map<string, number>();

function headers(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
}

function readFetchStatus(candidate: any): Evidence | undefined {
  const meta = candidate?.urlContextMetadata ?? candidate?.url_context_metadata;
  const list = meta?.urlMetadata ?? meta?.url_metadata;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const ok = list.some((m: any) =>
    String(m?.urlRetrievalStatus ?? m?.url_retrieval_status ?? '').toUpperCase().includes('SUCCESS'),
  );
  return ok ? 'content' : 'none';
}

function readSources(candidate: any): { uri: string; title: string }[] {
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? candidate?.grounding_metadata?.grounding_chunks;
  if (!Array.isArray(chunks)) return [];
  return chunks
    .filter((c: any) => c?.web?.uri)
    .map((c: any) => ({ uri: String(c.web.uri), title: String(c.web.title || c.web.uri) }))
    .slice(0, 5);
}

function readText(candidate: any): string {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p: any) => typeof p?.text === 'string' && !p.thought)
    .map((p: any) => p.text)
    .join('');
}

export async function analyzeWithGemini(
  input: AnalyzeInput,
  opts: {
    apiKey: string;
    model: string;
    useSearch: boolean;
    /** Skip Gemini's own page fetch and work only from the supplied text. */
    contextOnly?: boolean;
  },
): Promise<ProviderResult> {
  if (!opts.apiKey) throw new AiConfigError('Add your Gemini API key in Settings.');

  const url = `${API_BASE}/models/${encodeURIComponent(opts.model)}:generateContent`;
  const cacheKey = `${opts.model}|${opts.useSearch}`;
  let lastError = '';

  const firstMode = opts.contextOnly ? MODES.length - 1 : workingMode.get(cacheKey) ?? 0;
  for (let i = firstMode; i < MODES.length; i++) {
    const mode = MODES[i];

    const tools: any[] = [];
    if (mode.tools) {
      tools.push({ url_context: {} });
      if (opts.useSearch) tools.push({ google_search: {} });
    }

    const generationConfig: any = { temperature: 0.2 };
    if (mode.schema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = ANALYSIS_GEMINI_SCHEMA;
    }

    // Without the fetch tool the model can only work from text we collected.
    const prompt = mode.tools ? buildFetchingPrompt(input) : buildContextPrompt(input, 24_000);

    const body: any = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    };
    if (tools.length > 0) body.tools = tools;

    const result = await requestJson(
      url,
      { method: 'POST', headers: headers(opts.apiKey), body: JSON.stringify(body) },
      { providerLabel: LABEL, timeoutMs: 90_000 },
    );

    if (!result.ok) {
      const message = errorMessageFrom(result);
      if (result.status === 401 || result.status === 403 || /api key not valid|api_key_invalid/i.test(message)) {
        throw new AiConfigError(`Gemini rejected the API key: ${message}`);
      }
      if (result.status === 404) {
        throw new AiConfigError(
          `Gemini does not know the model "${opts.model}". Choose another model in Settings.`,
        );
      }
      if (result.status === 400) {
        // Most likely this combination of tools and schema is not supported.
        lastError = message;
        continue;
      }
      throw new Error(`Gemini error: ${message}`);
    }

    const candidate = result.body?.candidates?.[0];
    const text = readText(candidate);
    if (!text.trim()) {
      const block = result.body?.promptFeedback?.blockReason;
      const finish = candidate?.finishReason;
      throw new Error(
        block
          ? `Gemini declined this URL (${block}).`
          : `Gemini returned an empty answer${finish ? ` (${finish})` : ''}.`,
      );
    }

    if (!opts.contextOnly) workingMode.set(cacheKey, i);
    return {
      analysis: parseAnalysis(text, input.platform),
      fetchedByProvider: mode.tools ? readFetchStatus(candidate) : 'none',
      sources: readSources(candidate),
    };
  }

  throw new Error(`Gemini refused the request: ${lastError || 'unknown error'}`);
}

/** Text-generation models this key can use, newest naming first. */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey) throw new AiConfigError('Enter your Gemini API key first.');
  const result = await requestJson(
    `${API_BASE}/models?pageSize=200`,
    { method: 'GET', headers: { 'x-goog-api-key': apiKey } },
    { providerLabel: LABEL, timeoutMs: 20_000 },
  );
  if (!result.ok) {
    const message = errorMessageFrom(result);
    if (result.status === 400 || result.status === 401 || result.status === 403) {
      throw new AiConfigError(`Gemini rejected the API key: ${message}`);
    }
    throw new Error(`Could not load Gemini models: ${message}`);
  }
  const models: any[] = Array.isArray(result.body?.models) ? result.body.models : [];
  const excluded = /(tts|image|live|embedding|transcribe|robotics|audio|banana|omni|computer-use)/i;
  return models
    .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter((id) => id.startsWith('gemini') && !excluded.test(id))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

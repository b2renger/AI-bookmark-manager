/**
 * Shared types for the browser-side AI layer.
 *
 * Everything here runs in the browser: there is no server. Keys are entered
 * by the user in Settings and kept in this browser's localStorage only.
 */

export type ProviderId = 'gemini' | 'openai-compatible' | 'webgpu';

export type Platform = 'youtube' | 'threads' | 'twitter' | 'github' | 'article' | 'website';

/** How much of the real content was available when the summary was written. */
export type Evidence =
  /** The page / post text itself was read. */
  | 'content'
  /** Only a title, description or other metadata was available. */
  | 'metadata'
  /** Nothing could be retrieved. */
  | 'none';

export type SummaryLanguage = 'auto' | 'en' | 'fr';

export type ReaderMode = 'jina' | 'none';

export interface OpenAICompatibleSettings {
  presetId: string;
  baseUrl: string;
  model: string;
}

export interface AiSettings {
  provider: ProviderId;
  summaryLanguage: SummaryLanguage;

  geminiModel: string;
  /** Google Search grounding. Not included in Gemini's free tier. */
  geminiUseSearch: boolean;

  openai: OpenAICompatibleSettings;

  webgpuModelId: string;

  /** How page text is obtained for providers that cannot fetch pages themselves. */
  reader: ReaderMode;
}

/** Secrets, stored separately from the rest of the settings. */
export interface AiKeys {
  gemini: string;
  /** One key per OpenAI-compatible preset id, so switching preset keeps each key. */
  openai: Record<string, string>;
  jina: string;
}

/** What the model is asked to return for one URL. */
export interface ModelAnalysis {
  title: string;
  summary: string;
  keywords: string[];
  publicationDate: string | null;
  author: string | null;
  platform: Platform;
  /** The model's own statement of how much of the content it could see. */
  coverage: 'full' | 'partial' | 'none';
}

export interface PageContext {
  evidence: Evidence;
  /** Text handed to the model. Empty when evidence is 'none'. */
  text: string;
  /** Short human-readable description of where the text came from. */
  label: string;
}

export interface AnalyzeInput {
  url: string;
  platform: Platform;
  /** Present for providers that cannot fetch the page themselves. */
  context: PageContext | null;
  language: SummaryLanguage;
}

export interface ProviderResult {
  analysis: ModelAnalysis;
  /** Set by providers that fetch the page themselves (Gemini URL context). */
  fetchedByProvider?: Evidence;
  sources?: { uri: string; title: string }[];
  /** Set when a different model than the selected one produced the answer. */
  modelUsed?: string;
}

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigError';
  }
}

export class AiRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiRateLimitError';
  }
}

/** The service is overloaded. Usually passes on a later try or another model. */
export class AiBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiBusyError';
  }
}

/** The request never got an answer (dropped connection, timeout). */
export class AiNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiNetworkError';
  }
}

/** Failures worth an automatic second attempt later. */
export function isTransientError(e: unknown): boolean {
  return e instanceof AiBusyError || e instanceof AiNetworkError || e instanceof AiRateLimitError;
}

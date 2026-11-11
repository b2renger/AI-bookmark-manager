import { ModelAnalysis, Platform } from './types';

const PLATFORMS: Platform[] = ['youtube', 'threads', 'twitter', 'github', 'article', 'website'];

/** Thrown when a model reply cannot be turned into a bookmark record. */
export class AiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiParseError';
  }
}

/**
 * Pulls the first complete JSON object out of a model reply.
 *
 * Models that are not schema-constrained often wrap JSON in a code fence or a
 * sentence. Braces are matched with string awareness so a "}" inside a summary
 * does not end the object early.
 */
export function extractJsonObject(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  if (start === -1) throw new AiParseError('The model did not return JSON.');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          throw new AiParseError('The model returned malformed JSON.');
        }
      }
    }
  }
  throw new AiParseError('The model returned incomplete JSON.');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: unknown): string | null {
  const s = asString(value);
  if (!s || /^(null|none|unknown|n\/a)$/i.test(s)) return null;
  return s;
}

/** Accepts only a real calendar date and returns it as an ISO timestamp. */
export function normalizeDate(value: unknown): string | null {
  const s = asNullableString(value);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 1990 || d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return d.toISOString();
}

/** Validates and normalises a parsed model reply. */
export function toModelAnalysis(value: unknown, fallbackPlatform: Platform): ModelAnalysis {
  // Some models wrap the object in a one-element array.
  const obj = Array.isArray(value) ? value[0] : value;
  if (!obj || typeof obj !== 'object') throw new AiParseError('The model reply was not an object.');
  const o = obj as Record<string, unknown>;

  const keywords = Array.isArray(o.keywords)
    ? o.keywords
        .map((k) => asString(k).replace(/^#/, ''))
        .filter((k) => k.length > 0 && k.length <= 60)
        .slice(0, 8)
    : [];

  const platform = PLATFORMS.includes(o.platform as Platform) ? (o.platform as Platform) : fallbackPlatform;

  const coverageRaw = asString(o.coverage).toLowerCase();
  const coverage = coverageRaw === 'full' || coverageRaw === 'partial' || coverageRaw === 'none'
    ? coverageRaw
    : 'partial';

  return {
    title: asString(o.title),
    summary: asString(o.summary),
    keywords,
    publicationDate: normalizeDate(o.publicationDate),
    author: asNullableString(o.author),
    platform,
    coverage,
  };
}

export function parseAnalysis(raw: string, fallbackPlatform: Platform): ModelAnalysis {
  return toModelAnalysis(extractJsonObject(raw), fallbackPlatform);
}

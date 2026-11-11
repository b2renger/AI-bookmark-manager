import { AnalyzeInput } from './types';

/**
 * One URL per request.
 *
 * The previous version sent three URLs in one prompt, which let details and
 * search sources leak from one bookmark into another. A single URL keeps every
 * statement attributable to one page.
 */

export const SYSTEM_PROMPT = `You write bookmark records: a title, a short factual summary and keywords for ONE web page.

Rules:
- Use ONLY the content provided or retrieved for this URL. Never rely on what the URL "looks like" or on what you remember about the site.
- If you could not read the content, say so through "coverage": "none", and leave "summary" empty. Do not guess.
- If you only had a title or a short description, set "coverage": "partial" and summarise only what that text states.
- "summary": two sentences, concrete and specific to this page. No marketing tone, no "this page discusses".
- "keywords": 3 to 5 specific topics, lower case, no hashtags.
- "publicationDate": ISO date (YYYY-MM-DD) only when the content states it; otherwise null. Never estimate.
- "author": the author, creator or channel name when stated; otherwise null.
- "platform": one of "youtube", "threads", "twitter", "github", "article", "website".
- Reply with a single JSON object and nothing else.`;

/** JSON Schema used by OpenAI-compatible endpoints and the on-device model. */
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    publicationDate: { type: ['string', 'null'] },
    author: { type: ['string', 'null'] },
    platform: {
      type: 'string',
      enum: ['youtube', 'threads', 'twitter', 'github', 'article', 'website'],
    },
    coverage: { type: 'string', enum: ['full', 'partial', 'none'] },
  },
  required: ['title', 'summary', 'keywords', 'publicationDate', 'author', 'platform', 'coverage'],
  additionalProperties: false,
} as const;

/** Same shape in the OpenAPI-subset dialect that Gemini's responseSchema takes. */
export const ANALYSIS_GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    keywords: { type: 'ARRAY', items: { type: 'STRING' } },
    publicationDate: { type: 'STRING', nullable: true },
    author: { type: 'STRING', nullable: true },
    platform: {
      type: 'STRING',
      enum: ['youtube', 'threads', 'twitter', 'github', 'article', 'website'],
    },
    coverage: { type: 'STRING', enum: ['full', 'partial', 'none'] },
  },
  required: ['title', 'summary', 'keywords', 'platform', 'coverage'],
} as const;

const SHAPE_REMINDER =
  'JSON keys: "title", "summary", "keywords", "publicationDate", "author", "platform", "coverage".';

function languageRule(language: AnalyzeInput['language']): string {
  if (language === 'fr') return 'Write the title, summary and keywords in French.';
  if (language === 'en') return 'Write the title, summary and keywords in English.';
  return 'Write the summary and keywords in the language of the content. Keep the original title.';
}

/**
 * Prompt for a provider that fetches the page itself (Gemini URL context).
 * Extra context, when present, is metadata we could collect in the browser.
 */
export function buildFetchingPrompt(input: AnalyzeInput): string {
  const extra = input.context && input.context.text
    ? `\n\nAdditional context collected for this URL (${input.context.label}):\n"""\n${input.context.text}\n"""`
    : '';
  return `Read this URL and write its bookmark record.\n\nURL: ${input.url}${extra}\n\n${languageRule(input.language)}\n${SHAPE_REMINDER}`;
}

/** Prompt for a provider that only sees the text we hand it. */
export function buildContextPrompt(input: AnalyzeInput, maxChars: number): string {
  const ctx = input.context;
  if (input.task === 'from-summary' && ctx?.text) {
    const language = input.language === 'fr'
      ? 'Write the title and keywords in French.'
      : input.language === 'en'
        ? 'Write the title and keywords in English.'
        : 'Write the title and keywords in the language of the summary.';
    return `The user wrote the summary below for this bookmark. Write a short, specific title and 3 to 5 keywords that fit it.\n\nURL: ${input.url}\n\nSummary written by the user:\n"""\n${ctx.text.slice(0, maxChars)}\n"""\n\nUse only what the summary says. Copy the summary unchanged into "summary", set "coverage" to "full", and set "publicationDate" and "author" to null unless the summary states them.\n${language}\n${SHAPE_REMINDER}`;
  }
  if (!ctx || ctx.evidence === 'none' || !ctx.text) {
    return `No content could be retrieved for this URL.\n\nURL: ${input.url}\n\nReturn "coverage": "none", an empty "summary", an empty "keywords" list, and use the site name as "title".\n${SHAPE_REMINDER}`;
  }
  const text = ctx.text.length > maxChars ? `${ctx.text.slice(0, maxChars)}\n[truncated]` : ctx.text;
  const kind = ctx.evidence === 'content'
    ? 'This is the text of the page.'
    : 'Only this metadata is available, not the full page: use "coverage": "partial".';
  return `Write the bookmark record for this URL.\n\nURL: ${input.url}\nSource of the text below: ${ctx.label}. ${kind}\n\n"""\n${text}\n"""\n\n${languageRule(input.language)}\n${SHAPE_REMINDER}`;
}

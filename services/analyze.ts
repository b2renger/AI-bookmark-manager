import { analyzeWithGemini } from './ai/gemini';
import { analyzeWithOpenAICompatible } from './ai/openaiCompatible';
import { getPreset } from './ai/settings';
import { AiKeys, AiSettings, AnalyzeInput, Evidence, PageContext, Platform, ProviderResult } from './ai/types';
import { collectContext, detectPlatform, youtubeVideoId } from './content';

export interface BookmarkResult {
  url: string;
  title: string;
  /** Empty when the content could not be read. Never a placeholder. */
  summary: string;
  keywords: string[];
  publicationDate: string | null;
  sources: { uri: string; title: string }[];
  confidenceScore: number;
  confidenceReason: string;
  platform: Platform;
  author?: string;
  thumbnailUrl?: string;
}

export interface AnalyzeConfig {
  settings: AiSettings;
  keys: AiKeys;
  xApiKey?: string;
  proxyUrl?: string;
}

const RANK: Record<Evidence, number> = { none: 0, metadata: 1, content: 2 };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0] || 'Bookmark';
  }
}

async function runProvider(input: AnalyzeInput, config: AnalyzeConfig, contextOnly = false): Promise<ProviderResult> {
  const { settings, keys } = config;
  if (settings.provider === 'gemini') {
    return analyzeWithGemini(input, {
      apiKey: keys.gemini,
      model: settings.geminiModel,
      useSearch: settings.geminiUseSearch,
      contextOnly,
    });
  }
  if (settings.provider === 'openai-compatible') {
    const preset = getPreset(settings.openai.presetId);
    return analyzeWithOpenAICompatible(input, {
      baseUrl: settings.openai.baseUrl,
      apiKey: keys.openai[preset.id] || '',
      model: settings.openai.model,
      label: preset.label.replace(/\s*\(.*\)$/, ''),
    });
  }
  // Loaded on demand so the WebGPU client is not part of the first page load.
  const { analyzeWithWebGPU } = await import('./ai/webgpu/client');
  return analyzeWithWebGPU(input, { modelId: settings.webgpuModelId });
}

/**
 * Confidence is computed from what was actually retrieved, not from the
 * model's opinion of itself. The model can only lower it, by reporting that it
 * saw less than we thought.
 */
function score(evidence: Evidence, label: string, onDevice: boolean): { score: number; reason: string } {
  if (evidence === 'content') {
    return onDevice
      ? { score: 70, reason: `Written from ${label} by a small on-device model; check the details.` }
      : { score: 90, reason: `Written from ${label}.` };
  }
  if (evidence === 'metadata') {
    return { score: onDevice ? 45 : 55, reason: `Only ${label} was available; the full content was not read.` };
  }
  return { score: 10, reason: 'The content could not be read, so no summary was written.' };
}

/** Analyses one URL. Throws on configuration, network and rate-limit errors. */
export async function analyzeUrl(url: string, config: AnalyzeConfig): Promise<BookmarkResult> {
  const { settings, keys } = config;
  const platform = detectPlatform(url);
  const providerFetches = settings.provider === 'gemini';

  const contextOptions = {
    xApiKey: config.xApiKey,
    proxyUrl: config.proxyUrl,
    reader: settings.reader,
    jinaKey: keys.jina,
  };

  let context: PageContext = await collectContext(url, platform, { ...contextOptions, needPageText: !providerFetches });
  const input: AnalyzeInput = { url, platform, context, language: settings.summaryLanguage };

  let result = await runProvider(input, config);

  let evidence: Evidence;
  let label: string;

  if (providerFetches) {
    // No retrieval report from Gemini means we only have the model's own word.
    const fetched: Evidence = result.fetchedByProvider
      ?? (result.analysis.coverage === 'full' ? 'content' : result.analysis.coverage === 'partial' ? 'metadata' : 'none');

    if (RANK[fetched] >= RANK[context.evidence]) {
      evidence = fetched;
      label = fetched === 'content' ? 'the page, read by Gemini' : context.label;
    } else {
      evidence = context.evidence;
      label = context.label;
    }

    // Gemini could not fetch the page: try the reader, then ask again from that text.
    if (evidence !== 'content' && (settings.reader !== 'none' || config.proxyUrl)) {
      const fallback = await collectContext(url, platform, { ...contextOptions, needPageText: true });
      if (RANK[fallback.evidence] > RANK[evidence]) {
        context = fallback;
        result = await runProvider({ ...input, context }, config, true);
        evidence = fallback.evidence;
        label = fallback.label;
      }
    }
  } else {
    evidence = context.evidence;
    label = context.label;
  }

  const analysis = result.analysis;

  // The model may report that it saw less than the retrieval suggested.
  if (analysis.coverage === 'none') evidence = 'none';
  else if (analysis.coverage === 'partial' && evidence === 'content') {
    evidence = 'metadata';
    label = 'part of the content';
  }

  const { score: confidenceScore, reason: confidenceReason } = score(evidence, label, settings.provider === 'webgpu');
  const readable = evidence !== 'none';

  const videoId = platform === 'youtube' ? youtubeVideoId(url) : null;

  return {
    url,
    title: analysis.title || hostOf(url),
    summary: readable ? analysis.summary : '',
    keywords: readable ? analysis.keywords : [],
    publicationDate: readable ? analysis.publicationDate : null,
    sources: result.sources ?? [],
    confidenceScore,
    confidenceReason,
    // A platform recognised from the URL is certain; otherwise take the model's reading.
    platform: platform !== 'website' ? platform : analysis.platform,
    author: readable ? analysis.author ?? undefined : undefined,
    thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined,
  };
}

/** Pause between URLs, sized to typical free-tier per-minute limits. */
export function delayBetweenUrls(settings: AiSettings): number {
  if (settings.provider === 'webgpu') return 0;
  if (settings.provider === 'openai-compatible') {
    return getPreset(settings.openai.presetId).local ? 0 : 3000;
  }
  return 4000;
}

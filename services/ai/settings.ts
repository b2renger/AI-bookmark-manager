import { AiKeys, AiSettings } from './types';

const SETTINGS_KEY = 'ai-bookmark-manager-ai-settings';
const KEYS_KEY = 'ai-bookmark-manager-ai-keys';
/** Model choice saved by the previous, server-based version of the app. */
const LEGACY_GEMINI_MODEL_KEY = 'ai-bookmark-manager-gemini-model';

export interface OpenAIPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  /** Runs on the user's own machine: no key, no rate limit. */
  local: boolean;
  keyUrl?: string;
  /** The provider's own setup page, when there is no key to fetch. */
  docsUrl?: string;
  /** Anchor of this service's section in docs/SETUP.md. */
  guideAnchor?: string;
  hint: string;
}

/**
 * Presets for the generic OpenAI-compatible provider.
 *
 * Default model names are only starting points: free line-ups change often, so
 * Settings can load the live list from the provider's /models endpoint.
 */
export const OPENAI_PRESETS: OpenAIPreset[] = [
  {
    id: 'groq',
    label: 'Groq (free tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    local: false,
    keyUrl: 'https://console.groq.com/keys',
    guideAnchor: 'groq',
    hint: 'Fast open models. The free plan is limited per minute, so long lists are processed slowly.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/free',
    local: false,
    keyUrl: 'https://openrouter.ai/keys',
    guideAnchor: 'openrouter',
    hint: 'Pick a model whose name ends in ":free", or keep "openrouter/free". The free daily quota is small.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    local: false,
    keyUrl: 'https://console.mistral.ai/api-keys',
    guideAnchor: 'mistral',
    hint: 'European provider, strong in French. Load the model list to check which names your key can use.',
  },
  {
    id: 'ollama',
    label: 'Ollama (this computer)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: '',
    local: true,
    docsUrl: 'https://docs.ollama.com/faq',
    guideAnchor: 'ollama',
    hint: 'Ollama must allow this site: set OLLAMA_ORIGINS to this page\'s origin and restart Ollama. Desktop only.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (this computer)',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: '',
    local: true,
    docsUrl: 'https://lmstudio.ai/docs/developer/core/server/settings',
    guideAnchor: 'lm-studio',
    hint: 'Start the LM Studio server and turn on "Enable CORS" in its server settings. Desktop only.',
  },
  {
    id: 'custom',
    label: 'Custom endpoint',
    baseUrl: '',
    defaultModel: '',
    local: false,
    hint: 'Any endpoint that implements POST /chat/completions and allows browser (CORS) requests.',
  },
];

export function getPreset(id: string): OpenAIPreset {
  return OPENAI_PRESETS.find((p) => p.id === id) ?? OPENAI_PRESETS[OPENAI_PRESETS.length - 1];
}

/** Used when the live model list cannot be loaded. */
export const GEMINI_FALLBACK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
];

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'gemini',
  summaryLanguage: 'auto',
  geminiModel: DEFAULT_GEMINI_MODEL,
  geminiUseSearch: false,
  openai: {
    presetId: 'groq',
    baseUrl: OPENAI_PRESETS[0].baseUrl,
    model: OPENAI_PRESETS[0].defaultModel,
  },
  webgpuModelId: '',
  reader: 'jina',
};

export const EMPTY_KEYS: AiKeys = { gemini: '', openai: {}, jina: '' };

function readJson<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function loadAiSettings(): AiSettings {
  const stored = readJson<AiSettings>(SETTINGS_KEY);
  const merged: AiSettings = {
    ...DEFAULT_AI_SETTINGS,
    ...(stored ?? {}),
    openai: { ...DEFAULT_AI_SETTINGS.openai, ...(stored?.openai ?? {}) },
  };
  if (!stored) {
    // First run of the static version: carry over a previously chosen model
    // only if it is one we still know to exist.
    try {
      const legacy = localStorage.getItem(LEGACY_GEMINI_MODEL_KEY);
      if (legacy && GEMINI_FALLBACK_MODELS.includes(legacy)) merged.geminiModel = legacy;
    } catch {
      /* storage unavailable */
    }
  }
  return merged;
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable or full */
  }
}

export function loadAiKeys(): AiKeys {
  const stored = readJson<AiKeys>(KEYS_KEY);
  return {
    gemini: typeof stored?.gemini === 'string' ? stored.gemini : '',
    openai: stored?.openai && typeof stored.openai === 'object' ? { ...stored.openai } : {},
    jina: typeof stored?.jina === 'string' ? stored.jina : '',
  };
}

export function saveAiKeys(keys: AiKeys): void {
  try {
    localStorage.setItem(KEYS_KEY, JSON.stringify(keys));
  } catch {
    /* storage unavailable or full */
  }
}

/** Strips whitespace, wrapping quotes and a pasted "Bearer " prefix. */
export function cleanKey(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
}

/** Why the current provider cannot run yet, or null when it is ready. */
export function providerProblem(settings: AiSettings, keys: AiKeys): string | null {
  if (settings.provider === 'gemini') {
    return keys.gemini ? null : 'Add your Gemini API key in Settings to start.';
  }
  if (settings.provider === 'openai-compatible') {
    const preset = getPreset(settings.openai.presetId);
    if (!settings.openai.baseUrl) return 'Set the endpoint URL in Settings.';
    if (!settings.openai.model) return 'Choose a model in Settings.';
    if (!preset.local && preset.id !== 'custom' && !keys.openai[preset.id]) {
      return `Add your ${preset.label.replace(/\s*\(.*\)$/, '')} API key in Settings to start.`;
    }
    return null;
  }
  if (settings.provider === 'webgpu') {
    return settings.webgpuModelId ? null : 'Choose and download an on-device model in Settings.';
  }
  return 'Choose an AI provider in Settings.';
}

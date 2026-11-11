/**
 * Catalogue of on-device WebGPU models (run by @mlc-ai/web-llm).
 *
 * Kept apart from the worker so the Settings screen can list models without
 * pulling web-llm into the main bundle. Nothing outside the worker may import
 * the worker module.
 *
 * `vramMB` values are the `vram_required_MB` figures from web-llm's own
 * `prebuiltAppConfig`. The download is a comparable size and is cached.
 */

export interface WebGPUModelSpec {
  id: string;
  name: string;
  /** GPU memory required at runtime, from web-llm's prebuiltAppConfig. */
  vramMB: number;
  /** Every `q4f16_1` build needs the WebGPU `shader-f16` feature. */
  needsF16: boolean;
  contextWindow: number;
  /** Gemma's chat template has no system turn; its system text goes in the user message. */
  supportsSystemRole: boolean;
  /** Shown on the model card. */
  description: string;
}

export const WEBGPU_MODELS: WebGPUModelSpec[] = [
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M',
    vramMB: 376,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'Smallest and fastest. Summaries are basic and mostly English.',
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f32_1-MLC',
    name: 'SmolLM2 360M (f32)',
    vramMB: 580,
    needsF16: false,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'Smallest option for GPUs without 16-bit shaders (most Android phones). Basic summaries.',
  },
  {
    id: 'gemma3-1b-it-q4f16_1-MLC',
    name: 'Gemma 3 1B',
    vramMB: 711,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: false,
    description: 'Small and multilingual. A good first choice on a recent iPhone or a laptop.',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    vramMB: 879,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'Balanced small model. Fine for English, weaker in French.',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.2 1B (f32)',
    vramMB: 1129,
    needsF16: false,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'The most capable model for GPUs without 16-bit shaders, so the better Android choice.',
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 1.7B',
    vramMB: 1774,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'Noticeably better summaries than the 1B models. Desktop.',
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B',
    vramMB: 1895,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: false,
    description: 'Good multilingual quality for its size. Desktop.',
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    vramMB: 2264,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'A clear step up in faithfulness. Desktop with a dedicated GPU or Apple Silicon.',
  },
  {
    id: 'Phi-4-mini-instruct-q4f16_1-MLC',
    name: 'Phi-4 mini',
    vramMB: 3438,
    needsF16: true,
    contextWindow: 4096,
    supportsSystemRole: true,
    description: 'The strongest option offered here. Needs about 3.5 GB of GPU memory.',
  },
];

export function getModelSpec(id: string): WebGPUModelSpec | undefined {
  return WEBGPU_MODELS.find((m) => m.id === id);
}

export function formatSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

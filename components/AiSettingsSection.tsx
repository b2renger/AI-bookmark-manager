import React, { useEffect, useState } from 'react';
import { listGeminiModels } from '../services/ai/gemini';
import { listOpenAICompatibleModels } from '../services/ai/openaiCompatible';
import { GEMINI_FALLBACK_MODELS, OPENAI_PRESETS, cleanKey, getPreset } from '../services/ai/settings';
import { AiKeys, AiSettings, ProviderId } from '../services/ai/types';
import { DeviceProfile, ModelAvailability, assessAllModels, probeDevice } from '../services/ai/webgpu/deviceProbe';
import { WebGPUModelSpec, formatSize } from '../services/ai/webgpu/models';
import type { WorkerProgress } from '../services/ai/webgpu/protocol';

interface Props {
  settings: AiSettings;
  keys: AiKeys;
  onChange: (settings: AiSettings, keys: AiKeys) => void;
}

const inputClass =
  'w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white text-sm';
const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2';
const hintClass = 'mt-2 text-xs text-slate-500 dark:text-slate-400';
const smallButtonClass =
  'px-3 py-2 text-sm font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-100 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0';

const PROVIDERS: { id: ProviderId; label: string; blurb: string }[] = [
  {
    id: 'gemini',
    label: 'Google Gemini (your key)',
    blurb: 'Recommended. Gemini reads each page itself, so summaries come from the real content. Works on phones.',
  },
  {
    id: 'openai-compatible',
    label: 'Other provider or local server',
    blurb: 'Groq, OpenRouter, Mistral, Ollama, LM Studio or any OpenAI-compatible endpoint.',
  },
  {
    id: 'webgpu',
    label: 'On this device (WebGPU)',
    blurb: 'A small model downloaded into this browser. Private and free, but slower and less accurate.',
  },
];

export const AiSettingsSection: React.FC<Props> = ({ settings, keys, onChange }) => {
  const [geminiModels, setGeminiModels] = useState<string[]>([]);
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [listStatus, setListStatus] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  const [device, setDevice] = useState<DeviceProfile | null>(null);
  const [gpuProgress, setGpuProgress] = useState<WorkerProgress | null>(null);
  const [gpuBusy, setGpuBusy] = useState(false);
  const [gpuLoaded, setGpuLoaded] = useState<string | null>(null);

  const set = (patch: Partial<AiSettings>) => onChange({ ...settings, ...patch }, keys);
  const setKeys = (patch: Partial<AiKeys>) => onChange(settings, { ...keys, ...patch });

  const preset = getPreset(settings.openai.presetId);
  const presetKey = keys.openai[preset.id] || '';

  // Probe the hardware only when the on-device option is looked at.
  useEffect(() => {
    if (settings.provider !== 'webgpu') return;
    let cancelled = false;
    probeDevice().then((d) => {
      if (!cancelled) setDevice(d);
    });
    let unsubscribe = () => {};
    import('../services/ai/webgpu/client').then((client) => {
      if (cancelled) return;
      setGpuLoaded(client.loadedWebGPUModel());
      unsubscribe = client.onWebGPUProgress((p) => setGpuProgress(p));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [settings.provider]);

  const assessed: Array<{ model: WebGPUModelSpec; availability: ModelAvailability }> = device ? assessAllModels(device) : [];

  // Preselect the recommended model the first time.
  useEffect(() => {
    if (settings.provider !== 'webgpu' || settings.webgpuModelId || assessed.length === 0) return;
    const pick = assessed.find((r) => r.availability.recommended);
    if (pick) set({ webgpuModelId: pick.model.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, settings.provider]);

  const loadGeminiModels = async () => {
    setListStatus({ loading: true, error: null });
    try {
      const models = await listGeminiModels(cleanKey(keys.gemini));
      setGeminiModels(models);
      setListStatus({ loading: false, error: models.length ? null : 'No text models were returned for this key.' });
    } catch (e: any) {
      setListStatus({ loading: false, error: e?.message || 'Could not load the model list.' });
    }
  };

  const loadOpenaiModels = async () => {
    setListStatus({ loading: true, error: null });
    try {
      const models = await listOpenAICompatibleModels({
        baseUrl: settings.openai.baseUrl,
        apiKey: cleanKey(presetKey),
        label: preset.label,
      });
      setOpenaiModels(models);
      setListStatus({ loading: false, error: models.length ? null : 'The endpoint returned no models.' });
      if (models.length && !settings.openai.model) set({ openai: { ...settings.openai, model: models[0] } });
    } catch (e: any) {
      setListStatus({ loading: false, error: e?.message || 'Could not load the model list.' });
    }
  };

  const changePreset = (id: string) => {
    const next = getPreset(id);
    setOpenaiModels([]);
    setListStatus({ loading: false, error: null });
    set({ openai: { presetId: next.id, baseUrl: next.baseUrl, model: next.defaultModel } });
  };

  const downloadModel = async () => {
    if (!settings.webgpuModelId) return;
    setGpuBusy(true);
    setGpuProgress({ status: 'downloading', text: 'Starting…', progress: 0 });
    try {
      const client = await import('../services/ai/webgpu/client');
      await client.loadWebGPUModel(settings.webgpuModelId);
      setGpuLoaded(settings.webgpuModelId);
      setGpuProgress({ status: 'ready', text: 'Model ready on this device.', progress: 1 });
    } catch (e: any) {
      setGpuProgress({ status: 'error', text: e?.message || 'The model could not be loaded.', progress: 0 });
    } finally {
      setGpuBusy(false);
    }
  };

  const geminiOptions = Array.from(new Set([settings.geminiModel, ...(geminiModels.length ? geminiModels : GEMINI_FALLBACK_MODELS)])).filter(Boolean);
  const selectedGpu = assessed.find((r) => r.model.id === settings.webgpuModelId);

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
      <h3 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        AI model
      </h3>

      <label htmlFor="ai-provider" className={labelClass}>Where summaries are written</label>
      <select
        id="ai-provider"
        value={settings.provider}
        onChange={(e) => {
          setListStatus({ loading: false, error: null });
          set({ provider: e.target.value as ProviderId });
        }}
        className={inputClass}
      >
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <p className={hintClass}>{PROVIDERS.find((p) => p.id === settings.provider)?.blurb}</p>

      {/* ---------------- Gemini ---------------- */}
      {settings.provider === 'gemini' && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="gemini-key" className={labelClass}>Gemini API key</label>
            <input
              id="gemini-key"
              type="password"
              autoComplete="off"
              value={keys.gemini}
              onChange={(e) => setKeys({ gemini: e.target.value })}
              placeholder="Paste your key"
              className={inputClass}
            />
            <p className={hintClass}>
              Create a free key at{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">aistudio.google.com/apikey</a>.
              Free-tier requests are limited per minute and per day.
            </p>
          </div>

          <div>
            <label htmlFor="gemini-model" className={labelClass}>Model</label>
            <div className="flex gap-2">
              <select
                id="gemini-model"
                value={settings.geminiModel}
                onChange={(e) => set({ geminiModel: e.target.value })}
                className={inputClass}
              >
                {geminiOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button type="button" onClick={loadGeminiModels} disabled={listStatus.loading || !keys.gemini.trim()} className={smallButtonClass}>
                {listStatus.loading ? 'Loading…' : 'Load list'}
              </button>
            </div>
            <p className={hintClass}>"Load list" asks Google which models your key can use right now, and checks the key.</p>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={settings.geminiUseSearch}
              onChange={(e) => set({ geminiUseSearch: e.target.checked })}
              className="mt-1"
            />
            <span>
              Also use Google Search grounding
              <span className="block text-xs text-slate-500 dark:text-slate-400">Usually needs a paid Gemini key. Leave off on the free tier.</span>
            </span>
          </label>
        </div>
      )}

      {/* ---------------- OpenAI-compatible ---------------- */}
      {settings.provider === 'openai-compatible' && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="openai-preset" className={labelClass}>Service</label>
            <select id="openai-preset" value={preset.id} onChange={(e) => changePreset(e.target.value)} className={inputClass}>
              {OPENAI_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <p className={hintClass}>{preset.hint}</p>
            {preset.local && (
              <p className={hintClass}>
                This page's origin: <code className="font-mono">{window.location.origin}</code>
              </p>
            )}
          </div>

          <div>
            <label htmlFor="openai-base" className={labelClass}>Endpoint URL</label>
            <input
              id="openai-base"
              type="text"
              value={settings.openai.baseUrl}
              onChange={(e) => set({ openai: { ...settings.openai, baseUrl: e.target.value } })}
              placeholder="https://example.com/v1"
              className={inputClass}
            />
          </div>

          {!preset.local && (
            <div>
              <label htmlFor="openai-key" className={labelClass}>API key</label>
              <input
                id="openai-key"
                type="password"
                autoComplete="off"
                value={presetKey}
                onChange={(e) => setKeys({ openai: { ...keys.openai, [preset.id]: e.target.value } })}
                placeholder="Paste your key"
                className={inputClass}
              />
              {preset.keyUrl && (
                <p className={hintClass}>
                  Get a key at{' '}
                  <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{preset.keyUrl.replace(/^https:\/\//, '')}</a>.
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="openai-model" className={labelClass}>Model</label>
            <div className="flex gap-2">
              <input
                id="openai-model"
                type="text"
                list="openai-model-list"
                value={settings.openai.model}
                onChange={(e) => set({ openai: { ...settings.openai, model: e.target.value } })}
                placeholder="Model name"
                className={inputClass}
              />
              <datalist id="openai-model-list">
                {openaiModels.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button type="button" onClick={loadOpenaiModels} disabled={listStatus.loading || !settings.openai.baseUrl.trim()} className={smallButtonClass}>
                {listStatus.loading ? 'Loading…' : 'Load list'}
              </button>
            </div>
            <p className={hintClass}>"Load list" also tests the connection.</p>
          </div>
        </div>
      )}

      {/* ---------------- WebGPU ---------------- */}
      {settings.provider === 'webgpu' && (
        <div className="mt-4 space-y-3">
          {!device && <p className={hintClass}>Checking this device…</p>}

          {device && (device.tier === 'no-webgpu' || device.tier === 'no-adapter') && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-600 dark:text-red-300">
              {assessed[0]?.availability.blockedReason || 'On-device models cannot run in this browser.'}
            </div>
          )}

          {device && device.tier !== 'no-webgpu' && device.tier !== 'no-adapter' && (
            <>
              <label htmlFor="webgpu-model" className={labelClass}>Model</label>
              <select
                id="webgpu-model"
                value={settings.webgpuModelId}
                onChange={(e) => {
                  setGpuProgress(null);
                  set({ webgpuModelId: e.target.value });
                }}
                className={inputClass}
              >
                <option value="" disabled>Choose a model…</option>
                {assessed.map(({ model, availability }) => (
                  <option key={model.id} value={model.id} disabled={!availability.usable}>
                    {model.name} · {formatSize(model.vramMB)}
                    {availability.recommended ? ' · recommended here' : ''}
                    {!availability.usable ? ' · not available on this device' : ''}
                  </option>
                ))}
              </select>

              {selectedGpu && (
                <>
                  <p className={hintClass}>{selectedGpu.model.description}</p>
                  {selectedGpu.availability.blockedReason && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-600 dark:text-red-300">
                      {selectedGpu.availability.blockedReason}
                    </div>
                  )}
                  {selectedGpu.availability.warnings.map((w) => (
                    <div key={w} className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md text-xs text-amber-800 dark:text-amber-200">
                      {w}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={downloadModel}
                    disabled={gpuBusy || !selectedGpu.availability.usable || gpuLoaded === selectedGpu.model.id}
                    className={`${smallButtonClass} w-full`}
                  >
                    {gpuLoaded === selectedGpu.model.id
                      ? 'Model loaded'
                      : gpuBusy
                        ? 'Downloading…'
                        : `Download and load (about ${formatSize(selectedGpu.model.vramMB)})`}
                  </button>
                </>
              )}

              {gpuProgress && (
                <div className={`p-3 rounded-md text-xs border ${gpuProgress.status === 'error'
                  ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300'
                  : 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'}`}
                >
                  <p>{gpuProgress.text}</p>
                  {gpuProgress.status === 'downloading' && (
                    <div className="mt-2 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round(gpuProgress.progress * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}

              <p className={hintClass}>
                The model is downloaded once and kept by the browser. Keep this tab open during the download. If you skip the button, the download starts with the first link you process.
              </p>
            </>
          )}
        </div>
      )}

      {listStatus.error && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-600 dark:text-red-300">
          {listStatus.error}
        </div>
      )}

      {/* ---------------- Shared options ---------------- */}
      <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-600 space-y-4">
        <div>
          <label htmlFor="summary-language" className={labelClass}>Summary language</label>
          <select
            id="summary-language"
            value={settings.summaryLanguage}
            onChange={(e) => set({ summaryLanguage: e.target.value as AiSettings['summaryLanguage'] })}
            className={inputClass}
          >
            <option value="auto">Same as the page</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </div>

        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={settings.reader === 'jina'}
              onChange={(e) => set({ reader: e.target.checked ? 'jina' : 'none' })}
              className="mt-1"
            />
            <span>
              Fetch page text with Jina Reader
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {settings.provider === 'gemini'
                  ? 'Used only when Gemini cannot read a page itself.'
                  : 'This model cannot open web pages, so without this it only sees titles.'}
                {' '}The link address is sent to jina.ai.
              </span>
            </span>
          </label>
          {settings.reader === 'jina' && (
            <input
              type="password"
              autoComplete="off"
              value={keys.jina}
              onChange={(e) => setKeys({ jina: e.target.value })}
              placeholder="Jina API key (optional, raises the rate limit)"
              className={`${inputClass} mt-2`}
            />
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Keys are saved in this browser only and are sent only to the service they belong to.
        </p>
      </div>
    </div>
  );
};

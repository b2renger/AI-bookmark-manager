
import React, { useState, useEffect } from 'react';
import { CloseIcon } from './common/Icons';
import { getAccessibleDatabases } from '../services/notionService';
import { proxyFetch } from '../lib/proxyFetch';
import { AiSettingsSection } from './AiSettingsSection';
import { cleanKey } from '../services/ai/settings';
import { AiKeys, AiSettings } from '../services/ai/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  xApiKey: string;
  onSaveXApiKey: (key: string) => void;
  notionConfig: { apiKey: string; proxyUrl: string };
  onSaveNotionConfig: (config: { apiKey: string; proxyUrl: string }) => void;
  aiSettings: AiSettings;
  aiKeys: AiKeys;
  onSaveAi: (settings: AiSettings, keys: AiKeys) => void;
}

const PROXY_PRESETS = [
    { label: "None (default)", value: "" },
    { label: "Local dev server (only with npm run dev:proxy)", value: "/api/proxy" },
    { label: "Your own Cloudflare Worker (set the URL below)", value: "https://your-worker-name.workers.dev/?" },
    { label: "CORSProxy.io (public, often blocked)", value: "https://corsproxy.io/?" },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  xApiKey, 
  onSaveXApiKey,
  notionConfig,
  onSaveNotionConfig,
  aiSettings,
  aiKeys,
  onSaveAi
}) => {
  const [xKeyValue, setXKeyValue] = useState(xApiKey);
  const [notionKey, setNotionKey] = useState(notionConfig.apiKey);
  const [proxyUrl, setProxyUrl] = useState(notionConfig.proxyUrl);
  const [localAi, setLocalAi] = useState<AiSettings>(aiSettings);
  const [localKeys, setLocalKeys] = useState<AiKeys>(aiKeys);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; error: string | null; success: string | null }>({
    loading: false,
    error: null,
    success: null
  });
  const [testXStatus, setTestXStatus] = useState<{ loading: boolean; error: string | null; success: string | null }>({
    loading: false,
    error: null,
    success: null
  });

  useEffect(() => {
    if (isOpen) {
      setXKeyValue(xApiKey);
      setNotionKey(notionConfig.apiKey);
      setProxyUrl(notionConfig.proxyUrl);
      setLocalAi(aiSettings);
      setLocalKeys(aiKeys);
      setTestStatus({ loading: false, error: null, success: null });
      setTestXStatus({ loading: false, error: null, success: null });
    }
  }, [isOpen, xApiKey, notionConfig, aiSettings, aiKeys]);

  if (!isOpen) return null;

  const handleSave = () => {
    const sanitizedXKey = xKeyValue.trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
    const sanitizedNotionKey = notionKey.trim().replace(/^["']|["']$/g, '').trim();
    onSaveXApiKey(sanitizedXKey);
    onSaveNotionConfig({ apiKey: sanitizedNotionKey, proxyUrl: proxyUrl.trim() });
    const cleanedOpenai: Record<string, string> = {};
    Object.entries(localKeys.openai).forEach(([id, key]) => {
      const cleaned = cleanKey(String(key ?? ''));
      if (cleaned) cleanedOpenai[id] = cleaned;
    });
    onSaveAi(
      { ...localAi, openai: { ...localAi.openai, baseUrl: localAi.openai.baseUrl.trim(), model: localAi.openai.model.trim() } },
      { gemini: cleanKey(localKeys.gemini), openai: cleanedOpenai, jina: cleanKey(localKeys.jina) },
    );
    onClose();
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value !== 'custom') {
          setProxyUrl(value);
      }
  };

  const handleTestXConnection = async () => {
    const cleanKey = xKeyValue.trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
    if (!cleanKey) {
      setTestXStatus({ loading: false, error: "Please enter an X API Bearer Token first.", success: null });
      return;
    }
    setTestXStatus({ loading: true, error: null, success: null });
    
    console.group("X API Connection Test");
    try {
      // Test the credentials against the /2/tweets endpoint which is accessible with App-only Bearer Tokens
      const apiUrl = `https://api.twitter.com/2/tweets?ids=20`; // Jack's first tweet

      console.log(`[1] Configuration:`);
      console.log(` - Target API: ${apiUrl}`);
      console.log(` - Proxy configured: ${proxyUrl.trim() ? proxyUrl.trim() : 'none (direct)'}`);
      console.log(` - Headers sending: { "Authorization": "Bearer ${cleanKey.substring(0, 8)}..." }`);

      const res = await proxyFetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${cleanKey}`
        }
      }, proxyUrl.trim() || undefined);
      
      console.log(`[2] Response Received:`);
      console.log(` - Status Code: ${res.status} ${res.statusText}`);

      let errData = null;
      let rawText = '';
      try {
        rawText = await res.text();
        errData = JSON.parse(rawText);
      } catch(e) {
        // Raw text maintained
      }

      if (res.ok) {
        console.log(`[3] Test Result: Success`);
        setTestXStatus({ 
          loading: false, 
          error: null, 
          success: `Success! Connected to X API.` 
        });
      } else {
        let errMsg = `Status ${res.status}: ${res.statusText || 'Error'}`;
        if (errData && errData.title) {
          errMsg = `Status ${res.status}: ${errData.title}`;
          if (errData.detail) errMsg += ` (${errData.detail})`;
        } else if (errData && errData.error) {
          errMsg = `Status ${res.status}: ${errData.error}`;
        }

        if (res.status === 401) {
          errMsg += " — Invalid token. Ensure you pasted the App 'Bearer Token' (starts with AAAAA...) from developer.x.com, not the API Key or Secret.";
        } else if (res.status === 403) {
          errMsg += " — Forbidden. Ensure your X Developer project has access enabled for v2 Tweet lookup.";
        } else if (res.status === 503) {
          errMsg += " — X API often blocks public CORS proxies. Use your own proxy.";
        }

        console.error(`[3] Test Result: Error - ${errMsg}`);
        setTestXStatus({ loading: false, error: errMsg, success: null });
      }
    } catch (e: any) {
      console.error(`[3] Test Result: Exception - ${e.message}`, e);
      setTestXStatus({ loading: false, error: `Network exception: ${e.message || "Failed to fetch from X API."}`, success: null });
    }
    console.groupEnd();
  };

  const handleTestConnection = async () => {
    const cleanToken = notionKey.trim().replace(/^["']|["']$/g, '').trim();
    if (!cleanToken) {
      setTestStatus({ loading: false, error: "Please enter a Notion Integration Token first.", success: null });
      return;
    }
    setTestStatus({ loading: true, error: null, success: null });
    
    console.group("Notion API Connection Test");
    console.log(`[1] Configuration`);
    console.log(` - Target Endpoint: /search`);
    console.log(` - Proxy used: ${proxyUrl.trim() || 'none (direct)'}`);
    console.log(` - Auth Token (first 5 chars): ${cleanToken.substring(0, 5)}...`);
    
    try {
      const dbs = await getAccessibleDatabases(cleanToken, proxyUrl.trim());
      console.log(`[2] Result: Success. Found ${dbs.length} database(s).`);
      setTestStatus({ 
        loading: false, 
        error: null, 
        success: `Success! Found ${dbs.length} accessible database(s).` 
      });
    } catch (e: any) {
      console.error(`[2] Result: Failed - ${e.message}`, e);
      setTestStatus({ 
        loading: false, 
        error: e.message || "Failed to connect to Notion.", 
        success: null 
      });
    }
    console.groupEnd();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Settings</h2>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6">
          <AiSettingsSection
            settings={localAi}
            keys={localKeys}
            onChange={(nextSettings, nextKeys) => {
              setLocalAi(nextSettings);
              setLocalKeys(nextKeys);
            }}
          />

          {/* X / Twitter Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
            <h3 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-3">Twitter / X Integration</h3>
            <label htmlFor="x-api-key" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              API Bearer Token
            </label>
            <input
              id="x-api-key"
              type="password"
              value={xKeyValue}
              onChange={(e) => setXKeyValue(e.target.value)}
              placeholder="Enter X App Bearer Token (AAAA...)"
              className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white"
            />
             <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 mb-4">
               Optional. The X API refuses direct browser calls, so this token is only used when a proxy is set below. Without it, public posts are read through X's public embed endpoints when they allow it.
             </p>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-600">
              <button
                onClick={handleTestXConnection}
                disabled={testXStatus.loading}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-100 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {testXStatus.loading ? 'Testing Connection...' : 'Test X Connection'}
              </button>
              {testXStatus.error && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-600 dark:text-red-300">
                  {testXStatus.error}
                </div>
              )}
              {testXStatus.success && (
                <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md text-xs text-green-600 dark:text-green-300">
                  {testXStatus.success}
                </div>
              )}
            </div>
          </div>

          {/* Notion Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
            <h3 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-3">Notion Integration</h3>
            
            <div className="mb-4">
              <label htmlFor="notion-key" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Notion Integration Token
              </label>
              <input
                id="notion-key"
                type="password"
                value={notionKey}
                onChange={(e) => setNotionKey(e.target.value)}
                placeholder="secret_..."
                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white"
              />
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-600">
              <button
                onClick={handleTestConnection}
                disabled={testStatus.loading}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-100 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {testStatus.loading ? 'Testing Connection...' : 'Test Notion Connection'}
              </button>
              {testStatus.error && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-600 dark:text-red-300">
                  {testStatus.error}
                </div>
              )}
              {testStatus.success && (
                <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md text-xs text-green-600 dark:text-green-300">
                  {testStatus.success}
                </div>
              )}
            </div>
          </div>

          {/* Proxy Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
            <h3 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-3">Proxy Configuration</h3>
            
            <div className="mb-4">
              <label htmlFor="proxy-preset" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                CORS Proxy Service
              </label>
              <select
                 id="proxy-preset"
                 onChange={handlePresetChange}
                 className="w-full p-2.5 mb-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white text-sm"
                 value={PROXY_PRESETS.some(p => p.value === proxyUrl) ? proxyUrl : 'custom'}
              >
                  {PROXY_PRESETS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                  <option value="custom">Custom URL...</option>
              </select>

              <label htmlFor="proxy-url" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Proxy URL Base
              </label>
              <input
                id="proxy-url"
                type="text"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="No proxy"
                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Optional. Notion sync and the X API refuse direct browser calls, so they need a proxy you trust: your Notion token passes through it. Summaries work without one.
              </p>
              {proxyUrl.includes('cors-anywhere.herokuapp.com') && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md">
                  <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">
                    ⚠️ Action Required for this Proxy:
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    You must visit <a href="https://cors-anywhere.herokuapp.com/corsdemo" target="_blank" rel="noreferrer" className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-100">https://cors-anywhere.herokuapp.com/corsdemo</a> and click "Request temporary access" before this proxy will work.
                  </p>
                </div>
              )}
              {proxyUrl.includes('corsproxy.io') && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md">
                   <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
                    Note: CORSProxy.io often blocks requests originating from the preview domain.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

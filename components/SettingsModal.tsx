
import React, { useState, useEffect } from 'react';
import { CloseIcon } from './common/Icons';
import { getAccessibleDatabases } from '../services/notionService';
import { proxyFetch } from '../lib/proxyFetch';
import { AiSettingsSection } from './AiSettingsSection';
import { HelpLinks, guideUrl } from './HelpLinks';
import { versionDetails } from '../lib/version';
import { NotifyState, notifyState, setNotifications } from '../lib/background';
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
    { label: "Your own Cloudflare Worker (set the URL below)", value: "https://your-worker-name.workers.dev/?" },
    { label: "Local dev server (only with npm run dev:proxy)", value: "/api/proxy" },
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
  const [notify, setNotify] = useState<NotifyState>(() => notifyState());
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
    const proxy = proxyUrl.trim();
    if (!proxy) {
      setTestXStatus({
        loading: false,
        error: "The X API refuses calls made directly from a web page, so this token needs a proxy. Set one under Proxy Configuration below (see the setup guide). Without a token, public posts are still read through X's public embed endpoints.",
        success: null,
      });
      return;
    }
    setTestXStatus({ loading: true, error: null, success: null });

    try {
      // Post lookup works with an app-only Bearer Token.
      const res = await proxyFetch('https://api.x.com/2/tweets?ids=20', {
        headers: { 'Authorization': `Bearer ${cleanKey}` }
      }, proxy);

      const rawText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        // not JSON
      }

      if (res.ok) {
        setTestXStatus({ loading: false, error: null, success: 'Success! Connected to the X API.' });
        return;
      }

      // X's own errors carry a title/detail (or an errors list). Anything else
      // was produced by the proxy before the request ever reached X.
      const fromX = !!data && (typeof data.title === 'string' || typeof data.detail === 'string' || Array.isArray(data.errors));
      const proxyMessage = data && (typeof data.error === 'string' ? data.error : data.error?.message || data.message);

      let errMsg: string;
      if (!fromX) {
        errMsg = `The proxy refused the request (status ${res.status}${proxyMessage ? `: ${proxyMessage}` : ''}). This is not an answer from X, so the token was not tested. Check the proxy URL, or use your own proxy as described in the setup guide.`;
      } else {
        errMsg = `X answered ${res.status}: ${data.title || 'Error'}${data.detail ? ` (${data.detail})` : ''}`;
        if (res.status === 401) {
          errMsg += " — Invalid token. Paste the app's Bearer Token from the X developer console, not the API Key or Secret.";
        } else if (res.status === 403) {
          errMsg += " — The token is valid but X refuses this request. Check that the developer account has access (a plan or credits) for post lookup.";
        } else if (res.status === 429) {
          errMsg += " — Rate limit reached. Try again later.";
        }
      }
      setTestXStatus({ loading: false, error: errMsg, success: null });
    } catch (e: any) {
      setTestXStatus({
        loading: false,
        error: `Could not reach the proxy (${e.message || 'network error'}). Check the proxy URL and that it allows this site.`,
        success: null,
      });
    }
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

          {/* Background imports */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
            <h3 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-3">Background imports</h3>
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={notify === 'on'}
                disabled={notify === 'unsupported' || notify === 'blocked'}
                onChange={async (e) => setNotify(await setNotifications(e.target.checked))}
              />
              <span>
                Notify me when an import finishes or pauses in the background
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {notify === 'blocked'
                    ? 'Notifications are blocked for this site. Allow them in the browser\'s site settings, then come back here.'
                    : notify === 'unsupported'
                      ? 'This browser does not support notifications for web apps.'
                      : 'Only shown when the app is not on screen.'}
                </span>
              </span>
            </label>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              An import keeps going for a while after you switch away. If the browser stops it, the remaining links are kept and continue by themselves the next time you open the app.
            </p>
          </div>

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
             <HelpLinks links={[
               { label: 'Get a Bearer Token (X developer console)', href: 'https://console.x.com' },
               { label: 'Step-by-step guide', href: guideUrl('x--twitter') },
             ]} />
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
                placeholder="ntn_... or secret_..."
                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Create an internal integration, then add it to your database from the database's Connections menu. Sync needs a proxy (below).
              </p>
              <HelpLinks links={[
                { label: 'Create an integration (Notion)', href: 'https://www.notion.so/profile/integrations' },
                { label: 'Step-by-step guide', href: guideUrl('notion') },
              ]} />
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
                Optional. Notion sync and the X API refuse direct browser calls, so they need a proxy you trust: your tokens pass through it. Summaries work without one. The guide shows how to run a private one for free.
              </p>
              <HelpLinks links={[
                { label: 'Set up your own proxy (guide)', href: guideUrl('your-own-proxy') },
              ]} />
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">AI Bookmark Manager {versionDetails()}</p>

        <div className="mt-4 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white dark:text-slate-900 bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

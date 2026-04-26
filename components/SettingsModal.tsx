
import React, { useState, useEffect } from 'react';
import { CloseIcon } from './common/Icons';
import { getAccessibleDatabases } from '../services/notionService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  xApiKey: string;
  onSaveXApiKey: (key: string) => void;
  notionConfig: { apiKey: string; proxyUrl: string };
  onSaveNotionConfig: (config: { apiKey: string; proxyUrl: string }) => void;
  geminiModel: string;
  onSaveGeminiModel: (model: string) => void;
}

const PROXY_PRESETS = [
    { label: "CORSProxy.io (Recommended)", value: "https://corsproxy.io/?" },
    { label: "CodeTabs", value: "https://api.codetabs.com/v1/proxy?quest=" },
    { label: "ThingProxy", value: "https://thingproxy.freeboard.io/fetch/" },
    { label: "Worker Proxy (Cloudflare)", value: "https://cors-anywhere.herokuapp.com/" },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  xApiKey, 
  onSaveXApiKey,
  notionConfig,
  onSaveNotionConfig,
  geminiModel,
  onSaveGeminiModel
}) => {
  const [xKeyValue, setXKeyValue] = useState(xApiKey);
  const [notionKey, setNotionKey] = useState(notionConfig.apiKey);
  const [proxyUrl, setProxyUrl] = useState(notionConfig.proxyUrl);
  const [localGeminiModel, setLocalGeminiModel] = useState(geminiModel);
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
      setLocalGeminiModel(geminiModel);
      setTestStatus({ loading: false, error: null, success: null });
      setTestXStatus({ loading: false, error: null, success: null });
    }
  }, [isOpen, xApiKey, notionConfig, geminiModel]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveXApiKey(xKeyValue.trim());
    onSaveNotionConfig({ apiKey: notionKey.trim(), proxyUrl: proxyUrl.trim() });
    onSaveGeminiModel(localGeminiModel);
    onClose();
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value) {
          setProxyUrl(value);
      }
  };

  const handleTestXConnection = async () => {
    if (!xKeyValue.trim()) {
      setTestXStatus({ loading: false, error: "Please enter an X API Bearer Token first.", success: null });
      return;
    }
    setTestXStatus({ loading: true, error: null, success: null });
    
    console.group("X API Connection Test");
    try {
      // Test the credentials against the /2/users/me endpoint or a public tweet that won't 404
      const apiUrl = `https://api.twitter.com/2/tweets?ids=20`; // Jack's first tweet
      let requestUrl = apiUrl;
      if (proxyUrl.trim()) {
        const proxy = proxyUrl.trim();
        if (proxy.includes('corsproxy.io')) {
          requestUrl = `${proxy}${encodeURIComponent(apiUrl)}`;
        } else {
          requestUrl = `${proxy}${apiUrl}`;
        }
      }

      console.log(`[1] Configuration:`);
      console.log(` - Target API: ${apiUrl}`);
      console.log(` - Proxy configured: ${proxyUrl.trim() ? proxyUrl.trim() : 'None'}`);
      console.log(` - Final fetched URL: ${requestUrl}`);
      console.log(` - Headers sending: { "Authorization": "Bearer <hidden token>" }`);

      const res = await fetch(requestUrl, {
        headers: {
          'Authorization': `Bearer ${xKeyValue.trim()}`
        }
      });
      
      console.log(`[2] Response Received:`);
      console.log(` - Status Code: ${res.status} ${res.statusText}`);
      console.log(` - Headers:`, Object.fromEntries(res.headers.entries()));

      let errData = null;
      let rawText = '';
      try {
        rawText = await res.text();
        console.log(` - Body (raw text):`, rawText);
        errData = JSON.parse(rawText);
        console.log(` - Body (parsed JSON):`, errData);
      } catch(e) {
        console.log(` - Body (could not parse as JSON, raw text maintained)`);
      }

      if (res.ok) {
        console.log(`[3] Test Result: Success`);
        setTestXStatus({ 
          loading: false, 
          error: null, 
          success: `Success! Connected to X API.` 
        });
      } else {
        let errMsg = `Status ${res.status}`;
        if (errData && errData.title) {
          errMsg += `: ${errData.title}`;
        } else if (errData && errData.error) {
          errMsg += `: ${errData.error}`;
        } else if (rawText) {
          errMsg += ` (Body: ${rawText.substring(0, 100)})`;
        }

        console.error(`[3] Test Result: Error - ${errMsg}`);
        setTestXStatus({ loading: false, error: `Failed to connect: ${errMsg}`, success: null });
      }
    } catch (e: any) {
      console.error(`[3] Test Result: Exception - ${e.message}`, e);
      setTestXStatus({ loading: false, error: `Network exception: ${e.message || "Failed to fetch from X API."}`, success: null });
    }
    console.groupEnd();
  };

  const handleTestConnection = async () => {
    if (!notionKey.trim()) {
      setTestStatus({ loading: false, error: "Please enter a Notion Integration Token first.", success: null });
      return;
    }
    setTestStatus({ loading: true, error: null, success: null });
    
    console.group("Notion API Connection Test");
    console.log(`[1] Configuration`);
    console.log(` - Target Endpoint: /search`);
    console.log(` - Proxy used: ${proxyUrl.trim()}`);
    console.log(` - Auth Token (first 5 chars): ${notionKey.trim().substring(0, 5)}...`);
    
    try {
      const dbs = await getAccessibleDatabases(notionKey.trim(), proxyUrl.trim());
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
          {/* Gemini AI Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
            <h3 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Gemini AI Settings
            </h3>
            <label htmlFor="gemini-model" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Model Selection
            </label>
            <select
              id="gemini-model"
              value={localGeminiModel}
              onChange={(e) => setLocalGeminiModel(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white text-sm"
            >
              <optgroup label="Gemini 3.1">
                <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite Preview (Fast)</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview (High Quality)</option>
              </optgroup>
              <optgroup label="Gemini 3">
                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (Default)</option>
              </optgroup>
              <optgroup label="Legacy">
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="gemini-1.5-flash-8b">Gemini 1.5 Flash-8B</option>
              </optgroup>
            </select>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Select a cheaper model like <strong>Flash-8B</strong> if you are hitting rate limits (429 RESOURCE_EXHAUSTED). Note: Gemma models are not supported in this preview environment.
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
              placeholder="Enter X Bearer Token"
              className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white"
            />
             <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 mb-4">
               Allows fetching tweet text context. Falls back to oEmbed if empty or blocked.
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
                 defaultValue=""
              >
                  <option value="" disabled>Select a preset...</option>
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
                placeholder="https://corsproxy.io/?"
                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Used to bypass CORS when fetching YouTube/Twitter context or syncing to Notion.
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

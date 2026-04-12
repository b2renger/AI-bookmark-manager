
import React, { useState } from 'react';
import { CloseIcon } from './common/Icons';
import { getAccessibleDatabases } from '../services/notionService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  xApiKey: string;
  onSaveXApiKey: (key: string) => void;
  notionConfig: { apiKey: string; proxyUrl: string };
  onSaveNotionConfig: (config: { apiKey: string; proxyUrl: string }) => void;
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
  onSaveNotionConfig
}) => {
  const [xKeyValue, setXKeyValue] = useState(xApiKey);
  const [notionKey, setNotionKey] = useState(notionConfig.apiKey);
  const [proxyUrl, setProxyUrl] = useState(notionConfig.proxyUrl);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; error: string | null; success: string | null }>({
    loading: false,
    error: null,
    success: null
  });

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveXApiKey(xKeyValue.trim());
    onSaveNotionConfig({ apiKey: notionKey.trim(), proxyUrl: proxyUrl.trim() });
    onClose();
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value) {
          setProxyUrl(value);
      }
  };

  const handleTestConnection = async () => {
    if (!notionKey.trim()) {
      setTestStatus({ loading: false, error: "Please enter a Notion Integration Token first.", success: null });
      return;
    }
    setTestStatus({ loading: true, error: null, success: null });
    try {
      const dbs = await getAccessibleDatabases(notionKey.trim(), proxyUrl.trim());
      setTestStatus({ 
        loading: false, 
        error: null, 
        success: `Success! Found ${dbs.length} accessible database(s).` 
      });
    } catch (e: any) {
      setTestStatus({ 
        loading: false, 
        error: e.message || "Failed to connect to Notion.", 
        success: null 
      });
    }
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
             <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
               Allows fetching tweet text context. Falls back to oEmbed if empty or blocked.
             </p>
          </div>

          {/* Notion / Proxy Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
            <h3 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-3">Notion & Proxy Config</h3>
            
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
                Used to bypass CORS when fetching YouTube/Twitter context or syncing to Notion. The target URL is appended to this base.
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
                    Note: CORSProxy.io often blocks requests originating from the AI Studio preview domain. If it fails, try running the app locally or use the Worker Proxy instead.
                  </p>
                </div>
              )}
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

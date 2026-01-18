
import React, { useState, useEffect } from 'react';
import { CloseIcon } from './common/Icons';

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
    { label: "AllOrigins (JSON)", value: "https://api.allorigins.win/raw?url=" },
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
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
        // Check if a Gemini API key is already selected in the environment
        const checkGeminiKey = async () => {
            try {
                // @ts-ignore - window.aistudio is pre-configured in this environment
                const has = await window.aistudio.hasSelectedApiKey();
                setHasGeminiKey(has);
            } catch (e) {
                console.warn("Gemini key status check failed", e);
            }
        };
        checkGeminiKey();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectGeminiKey = async () => {
    try {
        // @ts-ignore - window.aistudio is pre-configured in this environment
        await window.aistudio.openSelectKey();
        // Assume success as per platform race condition guidance
        setHasGeminiKey(true);
    } catch (e) {
        console.error("Failed to open Gemini key selector", e);
    }
  };

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
          {/* Gemini API Section */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
            <h3 className="text-md font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-blue-600">
                <path d="M11.644 1.59a.75.75 0 0 1 .712 0l9.75 5.63a.75.75 0 0 1 0 1.298l-9.75 5.63a.75.75 0 0 1-.712 0l-9.75-5.63a.75.75 0 0 1 0-1.298l9.75-5.63Zm0 13.522a.75.75 0 0 1 .712 0l9.75 5.63a.75.75 0 0 1 0 1.298l-9.75 5.63a.75.75 0 0 1-.712 0l-9.75-5.63a.75.75 0 0 1 0-1.298l9.75-5.63Z" />
              </svg>
              Gemini API Key
            </h3>
            
            <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">Status</span>
                    <span className={`text-sm font-medium ${hasGeminiKey ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {hasGeminiKey ? '● Key Configured' : '○ No Key Selected'}
                    </span>
                </div>
                <button
                    onClick={handleSelectGeminiKey}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                    {hasGeminiKey ? 'Change Key' : 'Select Key'}
                </button>
            </div>
            
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Provide an API key from a paid GCP project to enable AI summaries. 
                Manage your billing and project settings at <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">ai.google.dev</a>.
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

            <div>
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

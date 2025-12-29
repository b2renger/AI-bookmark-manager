import React, { useState } from 'react';
import { CloseIcon } from './common/Icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  xApiKey: string;
  onSaveXApiKey: (key: string) => void;
  notionConfig: { apiKey: string; proxyUrl: string };
  onSaveNotionConfig: (config: { apiKey: string; proxyUrl: string }) => void;
}

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

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveXApiKey(xKeyValue.trim());
    onSaveNotionConfig({ apiKey: notionKey.trim(), proxyUrl: proxyUrl.trim() });
    onClose();
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

          {/* Notion Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
            <h3 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-3">Notion Integration</h3>
            
            <div className="mb-4">
              <label htmlFor="notion-key" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Internal Integration Token
              </label>
              <input
                id="notion-key"
                type="password"
                value={notionKey}
                onChange={(e) => setNotionKey(e.target.value)}
                placeholder="secret_..."
                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors dark:text-white"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                1. Create an integration at <a href="https://www.notion.so/my-integrations" target="_blank" className="text-blue-500 underline">notion.so/my-integrations</a><br/>
                2. Connect the integration to your database (via the ... menu on the database page).
              </p>
            </div>

            <div>
              <label htmlFor="proxy-url" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                CORS Proxy URL
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
                Required because Notion API blocks browser requests. <br/>
                Default: <code className="bg-slate-200 dark:bg-slate-900 px-1 rounded">https://corsproxy.io/?</code> (Public Proxy).<br/>
                Clear this field if using a browser extension or local proxy.
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

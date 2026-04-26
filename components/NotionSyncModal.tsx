import React, { useEffect, useState } from 'react';
import { Bookmark, NotionDatabase } from '../types';
import { getAccessibleDatabases, exportToNotion } from '../services/notionService';
import { Spinner } from './common/Spinner';
import { CloseIcon } from './common/Icons';

interface NotionSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  notionConfig: { apiKey: string; proxyUrl: string };
  onOpenSettings: () => void;
  onClearSuccessful: (successfulIds: string[]) => void;
}

export const NotionSyncModal: React.FC<NotionSyncModalProps> = ({ 
  isOpen, 
  onClose, 
  bookmarks, 
  notionConfig,
  onOpenSettings,
  onClearSuccessful
}) => {
  const [step, setStep] = useState<'loading' | 'select' | 'syncing' | 'complete' | 'error'>('loading');
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [selectedDbId, setSelectedDbId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [syncStats, setSyncStats] = useState<{ success: Bookmark[]; failed: Bookmark[]; skipped: Bookmark[] }>({ success: [], failed: [], skipped: [] });
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });

  useEffect(() => {
    if (isOpen) {
      if (!notionConfig.apiKey) {
          setErrorMsg("No API Key configured");
          setStep('error');
          return;
      }
      fetchDatabases();
    } else {
        // Reset state on close
        setStep('loading');
        setDatabases([]);
        setSelectedDbId('');
        setErrorMsg('');
    }
  }, [isOpen, notionConfig.apiKey]);

  const fetchDatabases = async () => {
    setStep('loading');
    setErrorMsg('');
    try {
      const dbs = await getAccessibleDatabases(notionConfig.apiKey, notionConfig.proxyUrl);
      if (dbs.length === 0) {
        setErrorMsg("No databases found. Make sure you have connected your Integration to a Database (via the '...' menu > Connections on the database page).");
        setStep('error');
      } else {
        setDatabases(dbs);
        setStep('select');
        // Auto select first if available
        if (dbs.length > 0) setSelectedDbId(dbs[0].id);
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to fetch databases. Check your API Key and Proxy settings.");
      setStep('error');
    }
  };

  const handleSync = async () => {
    if (!selectedDbId) return;
    const db = databases.find(d => d.id === selectedDbId);
    if (!db) return;

    setStep('syncing');
    setProgress({ current: 0, total: bookmarks.length, message: 'Initializing batch export...' });
    try {
      const results = await exportToNotion(
        notionConfig.apiKey, 
        notionConfig.proxyUrl,
        selectedDbId, 
        db.properties, 
        bookmarks,
        (current, total, message) => setProgress({ current, total, message })
      );
      setSyncStats(results);
      setStep('complete');
    } catch (e: any) {
      setErrorMsg(e.message || "Sync failed.");
      setStep('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
             Export to Notion
          </h2>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>

        {step === 'error' && (
            <div className="text-center">
                <div className="text-red-500 bg-red-100 dark:bg-red-900/50 p-4 rounded-lg mb-4 text-sm">
                    {errorMsg}
                </div>
                 {errorMsg.includes("API Key") ? (
                     <button onClick={onOpenSettings} className="text-blue-600 hover:underline text-sm">Open Settings</button>
                 ) : (
                     <button onClick={fetchDatabases} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-md text-sm">Try Again</button>
                 )}
            </div>
        )}

        {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-8">
                <Spinner className="w-8 h-8 text-blue-500 mb-4" />
                <p className="text-slate-600 dark:text-slate-300">Fetching databases...</p>
            </div>
        )}

        {step === 'select' && (
            <div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                    Select a database to merge <strong>{bookmarks.length}</strong> bookmarks into.
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg mb-4 border border-blue-100 dark:border-blue-800">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                        <strong>Note:</strong> We will check for columns named <code>URL</code>, <code>Description</code>, <code>Keywords</code>, and <code>Date</code>. If they don't exist, we will create them automatically.
                    </p>
                </div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Target Database</label>
                <select 
                    value={selectedDbId} 
                    onChange={(e) => setSelectedDbId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-6 dark:text-white"
                >
                    {databases.map(db => (
                        <option key={db.id} value={db.id}>{db.title}</option>
                    ))}
                </select>
                <div className="flex justify-end space-x-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                    <button onClick={handleSync} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
                        Start Sync
                    </button>
                </div>
            </div>
        )}

        {step === 'syncing' && (
            <div className="flex flex-col items-center justify-center py-8">
                <Spinner className="w-8 h-8 text-blue-500 mb-4" />
                <p className="text-slate-600 dark:text-slate-300 font-medium mb-1">Syncing to Notion</p>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mt-4 mb-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                    ></div>
                </div>
                <div className="flex justify-between w-full text-xs text-slate-500 mb-3">
                    <span>{progress.current} of {progress.total} items</span>
                    <span>{Math.round(progress.total > 0 ? (progress.current / progress.total) * 100 : 0)}%</span>
                </div>
                <p className="text-xs text-slate-500 text-center truncate w-full px-4">{progress.message}</p>
            </div>
        )}

        {step === 'complete' && (
            <div className="text-center py-4">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 mb-4">
                    <svg className="h-6 w-6 text-green-600 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Sync Complete!</h3>
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-6 space-y-1">
                    <p>Successfully added <span className="font-semibold text-green-600 dark:text-green-400">{syncStats.success.length}</span> bookmarks.</p>
                    {syncStats.skipped.length > 0 && (
                        <p className="text-yellow-600 dark:text-yellow-400">Skipped <span className="font-semibold">{syncStats.skipped.length}</span> (already exist).</p>
                    )}
                    {syncStats.failed.length > 0 && (
                        <div className="mt-2 text-left bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-800/50">
                            <p className="text-red-600 dark:text-red-400 font-medium mb-1">Failed to add <span className="font-semibold">{syncStats.failed.length}</span> bookmarks:</p>
                            <ul className="list-disc list-inside text-xs text-red-500 dark:text-red-300 max-h-24 overflow-y-auto">
                                {syncStats.failed.map(b => (
                                    <li key={b.id} className="truncate" title={b.url}>{b.title || b.url}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
                
                <div className="flex flex-col space-y-3">
                    {(syncStats.failed.length > 0 || syncStats.skipped.length > 0) && syncStats.success.length > 0 && (
                        <button 
                            onClick={() => {
                                onClearSuccessful(syncStats.success.map(b => b.id));
                                onClose();
                            }} 
                            className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-lg transition-colors border border-blue-200 dark:border-blue-800"
                        >
                            Keep Only Failed/Skipped in List
                        </button>
                    )}
                    <button onClick={onClose} className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">
                        Done
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

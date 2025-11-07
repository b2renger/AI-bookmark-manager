
import React from 'react';

interface ApiKeySetupProps {
  onSelectKey: () => void;
  error?: string | null;
}

export const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onSelectKey, error }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans p-4">
      <div className="max-w-md w-full text-center bg-white dark:bg-slate-800 p-8 rounded-xl shadow-2xl">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500 mb-4">
          Welcome to AI Bookmark Manager
        </h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          To get started, please select a Google AI API key for your project. This will be used to generate summaries and keywords for your bookmarks.
        </p>
        
        {error && (
            <div className="mb-6 text-center text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-lg" role="alert">
                {error}
            </div>
        )}

        <button
          onClick={onSelectKey}
          className="w-full px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-all"
        >
          Select API Key
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
          By using this service, you agree to the Gemini API's terms and pricing. 
          For more information, please review the{' '}
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            billing documentation
          </a>.
        </p>
      </div>
    </div>
  );
};

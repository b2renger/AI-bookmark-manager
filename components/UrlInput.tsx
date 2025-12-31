import React, { useState } from 'react';
import { Spinner } from './common/Spinner';

interface UrlInputProps {
  onProcess: (urls: { url: string; addDate?: string }[]) => void;
  isLoading: boolean;
  onOpenSettings: () => void;
}

export const UrlInput: React.FC<UrlInputProps> = ({ onProcess, isLoading, onOpenSettings }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Added explicit return type to map to ensure inferred type is consistent for the filter predicate
    const processedUrls = text.split('\n').map((line): { url: string; addDate?: string } | null => {
        const trimmedLine = line.trim();

        // Check for Netscape bookmark format with ADD_DATE (case-insensitive)
        const bookmarkMatch = trimmedLine.match(/<a\s+href="([^"]+)"[^>]*add_date="(\d+)"/i);
        if (bookmarkMatch && bookmarkMatch[1] && bookmarkMatch[2]) {
            const url = bookmarkMatch[1];
            // ADD_DATE is a Unix timestamp in seconds. Convert to milliseconds for Date constructor.
            const addDateTimestamp = parseInt(bookmarkMatch[2], 10) * 1000;
            const addDate = new Date(addDateTimestamp).toISOString();
            return { url, addDate };
        }

        // Fallback for Netscape bookmark format without ADD_DATE
        const hrefMatch = trimmedLine.match(/<a\s+href="([^"]+)"/i);
        if (hrefMatch && hrefMatch[1]) {
            return { url: hrefMatch[1], addDate: undefined };
        }

        // If it's not a bookmark line, filter out other common HTML tags
        // that might be part of a pasted bookmark file.
        if (trimmedLine.startsWith('<')) {
            return null; // Discard tags like <DT>, <H1>, etc.
        }
        
        // Apply existing cleaning logic for plain text URLs (e.g., from a list)
        const withoutNumber = trimmedLine.replace(/^\d+\s*[.)-]\s+/, '');
        const withoutBullet = withoutNumber.replace(/^[-*]\s+/, '');
        
        // Ensure we don't return an empty object
        if (withoutBullet.length > 0) {
            return { url: withoutBullet, addDate: undefined };
        }
        
        return null;
    }).filter((item): item is { url: string; addDate?: string } => item !== null);
    
    onProcess(processedUrls);
    setText('');
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg mb-8">
      <form onSubmit={handleSubmit}>
        <label htmlFor="url-input" className="block text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
          Import Bookmarks
        </label>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Paste one URL per line or the content of a bookmarks HTML file. The AI will generate a title, summary, and keywords for each.
        </p>

        <div className="mb-4 bg-blue-50 dark:bg-slate-700/50 rounded-lg p-4 border border-blue-100 dark:border-slate-600 flex items-start gap-3">
             <div className="text-blue-500 dark:text-blue-400 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
             </div>
             <div className="text-xs text-slate-600 dark:text-slate-300">
                <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Integration Setup</p>
                <p>
                    To generate summaries for <strong>X (Twitter)</strong> posts or to sync your bookmarks with a <strong>Notion</strong> database, 
                    please ensure you have configured your tokens in the <button type="button" onClick={onOpenSettings} className="text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center">Settings</button>.
                </p>
             </div>
        </div>

        <textarea
          id="url-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"https://example.com/article-1\nhttps://anothersite.org/important-info\nOr paste content from a bookmarks.html file..."}
          rows={6}
          className="w-full p-3 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !text.trim()}
          className="mt-4 w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? (
            <>
              <Spinner className="h-5 w-5 mr-3 text-white" />
              Processing...
            </>
          ) : (
            'Generate Details'
          )}
        </button>
      </form>
    </div>
  );
};

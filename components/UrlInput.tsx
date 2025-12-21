import React, { useState } from 'react';
import { Spinner } from './common/Spinner';

interface UrlInputProps {
  onProcess: (urls: { url: string; addDate?: string }[]) => void;
  isLoading: boolean;
}

export const UrlInput: React.FC<UrlInputProps> = ({ onProcess, isLoading }) => {
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

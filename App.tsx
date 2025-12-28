import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UrlInput } from './components/UrlInput';
import { BookmarkList } from './components/BookmarkList';
import { Header } from './components/Header';
import { generateBookmarksBatch } from './services/geminiService';
import { Bookmark } from './types';
import { v4 as uuidv4 } from 'uuid';

const AI_BOOKMARKS_STORAGE_KEY = 'ai-bookmark-manager-bookmarks';
const THEME_STORAGE_KEY = 'ai-bookmark-manager-theme';

// Safe delay between requests to stay under 15 RPM (approx 1 request every 10s is 6 RPM)
// This conservative delay helps avoid 429 errors on the free/preview tier.
const RATE_LIMIT_DELAY_MS = 10000;
const ERROR_BACKOFF_MS = 30000; // Wait 30s if we hit a 429

const stripUtmParams = (urlString: string): string => {
  if (!urlString || !urlString.includes('utm_')) return urlString;
  try {
    const url = new URL(urlString);
    const params = url.searchParams;
    const keysToDelete = Array.from(params.keys()).filter(key => key.startsWith('utm_'));
    keysToDelete.forEach(key => params.delete(key));
    return url.toString();
  } catch (e) {
    return urlString;
  }
};

const App: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  // We use this state to lock the queue processing so we only process one item at a time
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      return storedTheme !== null ? storedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    const stored = localStorage.getItem(AI_BOOKMARKS_STORAGE_KEY);
    if (stored) {
      try {
        setBookmarks(JSON.parse(stored));
      } catch (e) {
        localStorage.removeItem(AI_BOOKMARKS_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(AI_BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => setIsDarkMode(prev => !prev), []);

  // Queue Processing Effect
  // This ensures that we only ever have ONE active API request at a time.
  useEffect(() => {
    let mounted = true;

    const processNextItem = async () => {
        // If already processing, do nothing (wait for lock to release)
        if (isProcessing) return;

        // Find the next item in the queue
        const nextItem = bookmarks.find(b => b.status === 'queued');
        
        // If queue is empty, we are done
        if (!nextItem) return;

        // Lock the processor
        setIsProcessing(true);
        setError(null);

        // Update UI to show processing state
        setBookmarks(prev => prev.map(b => 
            b.id === nextItem.id ? { ...b, status: 'processing', title: 'Analyzing...' } : b
        ));

        try {
            // Process the single URL
            const results = await generateBookmarksBatch([nextItem.url]);
            const res = results[0];
            
            if (mounted) {
                setBookmarks(prev => prev.map(b => {
                    if (b.id !== nextItem.id) return b;
                    
                    const isWarning = !res.summary || res.summary.length < 10;
                    return {
                        ...b,
                        title: res.title,
                        summary: res.summary,
                        keywords: res.keywords,
                        sources: res.sources,
                        createdAt: res.publicationDate || b.createdAt,
                        status: isWarning ? 'warning' : 'done',
                    };
                }));
            }

            // Respect rate limits by waiting before releasing the lock
            await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));

        } catch (e: any) {
            const msg = e instanceof Error ? e.message : 'Analysis failed';
            console.error(`Error processing ${nextItem.url}:`, msg);

            if (mounted) {
                setBookmarks(prev => prev.map(b => 
                    b.id === nextItem.id ? { ...b, title: 'Error', summary: msg, status: 'error' } : b
                ));
            }

            // If we hit a rate limit, pause much longer to let the quota bucket drain
            if (msg.includes('429') || msg.toLowerCase().includes('too many requests')) {
                await new Promise(r => setTimeout(r, ERROR_BACKOFF_MS));
            } else {
                await new Promise(r => setTimeout(r, 2000));
            }
        } finally {
            if (mounted) setIsProcessing(false);
        }
    };

    processNextItem();

    return () => { mounted = false; };
  }, [bookmarks, isProcessing]);

  const handleProcessUrls = useCallback(async (urlData: { url: string; addDate?: string }[]) => {
    if (!urlData.length) return;

    setError(null);

    const existingUrls = new Set(bookmarks.filter(b => b.status !== 'error').map(b => b.url));
    const uniqueBatch: { url: string; addDate?: string }[] = [];

    for (const data of urlData) {
        const cleaned = stripUtmParams(data.url);
        if (!existingUrls.has(cleaned)) {
            uniqueBatch.push({ ...data, url: cleaned });
            existingUrls.add(cleaned);
        }
    }

    if (uniqueBatch.length === 0) return;

    // Add new items with 'queued' status. The useEffect above will pick them up.
    const newEntries: Bookmark[] = uniqueBatch.map(data => ({
      id: uuidv4(),
      url: data.url,
      title: 'Queued',
      summary: 'Waiting for analysis...',
      keywords: [],
      status: 'queued',
      createdAt: data.addDate || new Date().toISOString(),
    }));

    setBookmarks(prev => [...prev, ...newEntries]);
  }, [bookmarks]);

  const handleUpdateBookmark = useCallback((updated: Bookmark) => {
    setBookmarks(prev => prev.map(b => (b.id === updated.id ? updated : b)));
  }, []);

  const handleDeleteBookmark = useCallback((id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  }, []);
  
  const handleClearAll = useCallback(() => setBookmarks([]), []);

  const handleRetryBookmark = useCallback((id: string) => {
    // To retry, we simply set the status back to 'queued'
    setBookmarks(prev => prev.map(b => 
        b.id === id ? { ...b, status: 'queued', title: 'Queued', summary: 'Waiting for retry...' } : b
    ));
  }, []);

  // Check if anything is queued or processing
  const isGlobalLoading = bookmarks.some(b => b.status === 'queued' || b.status === 'processing');

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-200">
      <Header bookmarks={bookmarks} onClearAll={handleClearAll} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      <main className="container mx-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <UrlInput onProcess={handleProcessUrls} isLoading={isGlobalLoading} />
          {error && <div className="mt-4 text-center text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-lg">{error}</div>}
          <BookmarkList bookmarks={bookmarks} onUpdate={handleUpdateBookmark} onDelete={handleDeleteBookmark} onRetry={handleRetryBookmark} />
        </div>
      </main>
    </div>
  );
};

export default App;
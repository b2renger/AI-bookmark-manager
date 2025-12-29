import React, { useState, useCallback, useEffect } from 'react';
import { UrlInput } from './components/UrlInput';
import { BookmarkList } from './components/BookmarkList';
import { Header } from './components/Header';
import { generateBookmarksBatch, ApiKeyError } from './services/geminiService';
import { Bookmark } from './types';
import { v4 as uuidv4 } from 'uuid';

const AI_BOOKMARKS_STORAGE_KEY = 'ai-bookmark-manager-bookmarks';
const THEME_STORAGE_KEY = 'ai-bookmark-manager-theme';
const BATCH_SIZE = 5; // Efficiently process 5 URLs per call to stay under TPM while reducing RPM
const BATCH_DELAY_MS = 5000; // 5 seconds wait between batches to safely respect 15 RPM limits

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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      // Default to dark mode if no preference is stored
      return storedTheme !== null ? storedTheme === 'dark' : true;
    } catch (e) {
      return true;
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

  const handleProcessUrls = useCallback(async (urlData: { url: string; addDate?: string }[]) => {
    if (!urlData.length) return;

    setIsLoading(true);
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

    if (uniqueBatch.length === 0) {
      setIsLoading(false);
      return;
    }

    const newEntries: Bookmark[] = uniqueBatch.map(data => ({
      id: uuidv4(),
      url: data.url,
      title: 'Queued...',
      summary: '',
      keywords: [],
      status: 'processing',
      createdAt: data.addDate || new Date().toISOString(),
    }));

    setBookmarks(prev => [...prev, ...newEntries]);

    // Process in Chunks
    for (let i = 0; i < newEntries.length; i += BATCH_SIZE) {
        const chunk = newEntries.slice(i, i + BATCH_SIZE);
        const chunkUrls = chunk.map(b => b.url);

        // Update titles to reflect active processing
        setBookmarks(prev => prev.map(b => 
            chunk.some(c => c.id === b.id) ? { ...b, title: 'Processing batch...' } : b
        ));

        try {
            const results = await generateBookmarksBatch(chunkUrls);
            
            setBookmarks(prev => {
                const next = [...prev];
                results.forEach(res => {
                    const idx = next.findIndex(b => b.url === res.url && b.status === 'processing');
                    if (idx !== -1) {
                        const isWarning = !res.summary || res.summary.length < 10;
                        next[idx] = {
                            ...next[idx],
                            title: res.title,
                            summary: res.summary,
                            keywords: res.keywords,
                            sources: res.sources,
                            // If the AI found a specific publication date, prefer it. Otherwise keep imported date.
                            createdAt: res.publicationDate || next[idx].createdAt,
                            status: isWarning ? 'warning' : 'done',
                        };
                    }
                });
                return next;
            });
        } catch (e: any) {
            if (e instanceof ApiKeyError) {
                setError("API Key Error. Please check your environment configuration.");
                setIsLoading(false);
                return;
            }
            
            const msg = e instanceof Error ? e.message : 'Batch failed';
            setBookmarks(prev => prev.map(b => 
                chunk.some(c => c.id === b.id) ? { ...b, title: 'Error', summary: msg, status: 'error' } : b
            ));
        }

        // Respect RPM quotas
        if (i + BATCH_SIZE < newEntries.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }
    
    setIsLoading(false);
  }, [bookmarks]);

  const handleUpdateBookmark = useCallback((updated: Bookmark) => {
    setBookmarks(prev => prev.map(b => (b.id === updated.id ? updated : b)));
  }, []);

  const handleDeleteBookmark = useCallback((id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  }, []);
  
  const handleClearAll = useCallback(() => setBookmarks([]), []);

  const handleRetryBookmark = useCallback(async (id: string) => {
    const target = bookmarks.find(b => b.id === id);
    if (!target) return;

    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, status: 'processing', title: 'Retrying...' } : b));
    
    try {
        const result = await generateBookmarksBatch([target.url]);
        const res = result[0];
        setBookmarks(prev => prev.map(b => b.id === id ? {
            ...b,
            title: res.title,
            summary: res.summary,
            keywords: res.keywords,
            sources: res.sources,
            createdAt: res.publicationDate || b.createdAt,
            status: (!res.summary || res.summary.length < 10) ? 'warning' : 'done'
        } : b));
    } catch (e: any) {
        setBookmarks(prev => prev.map(b => b.id === id ? { ...b, status: 'error', summary: e.message } : b));
    }
  }, [bookmarks]);

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-200">
      <Header bookmarks={bookmarks} onClearAll={handleClearAll} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      <main className="container mx-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <UrlInput onProcess={handleProcessUrls} isLoading={isLoading} />
          {error && <div className="mt-4 text-center text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-lg">{error}</div>}
          <BookmarkList bookmarks={bookmarks} onUpdate={handleUpdateBookmark} onDelete={handleDeleteBookmark} onRetry={handleRetryBookmark} />
        </div>
      </main>
    </div>
  );
};

export default App;

import React, { useState, useCallback, useEffect } from 'react';
import { UrlInput } from './components/UrlInput';
import { BookmarkList } from './components/BookmarkList';
import { Header } from './components/Header';
import { ApiKeySetup } from './components/ApiKeySetup';
import { generateBookmarkDetails, ApiKeyError } from './services/geminiService';
import { Bookmark } from './types';
import { v4 as uuidv4 } from 'uuid';

const AI_BOOKMARKS_STORAGE_KEY = 'ai-bookmark-manager-bookmarks';
const THEME_STORAGE_KEY = 'ai-bookmark-manager-theme';

// Helper function to remove UTM tracking parameters from a URL
const stripUtmParams = (urlString: string): string => {
  if (!urlString || !urlString.includes('utm_')) return urlString;
  try {
    const url = new URL(urlString);
    const params = url.searchParams;
    const keysToDelete = Array.from(params.keys()).filter(key => key.startsWith('utm_'));
    if (keysToDelete.length > 0) {
        keysToDelete.forEach(key => params.delete(key));
        return url.toString();
    }
    return urlString; 
  } catch (e) {
    return urlString;
  }
};

const App: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // Initialize dark mode from localStorage or system preference
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme !== null) {
        return storedTheme === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  });

  // Check if API key is already selected on mount
  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore - aistudio is injected environment
      if (window.aistudio?.hasSelectedApiKey) {
        // @ts-ignore
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // Fallback or development environment
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio?.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      // Guidelines state: proceed assuming success after triggering dialog
      setHasKey(true); 
    }
  };

  // Load bookmarks from localStorage on initial mount
  useEffect(() => {
    const storedBookmarks = localStorage.getItem(AI_BOOKMARKS_STORAGE_KEY);
    if (storedBookmarks) {
      try {
        const parsedBookmarks = JSON.parse(storedBookmarks);
        const migratedBookmarks = parsedBookmarks.map((b: any) => ({
            ...b,
            id: b.id || uuidv4(),
            status: b.status === 'processing' ? 'error' : (b.status || 'done'),
            createdAt: b.createdAt || new Date().toISOString(),
        })) as Bookmark[];
        setBookmarks(migratedBookmarks);
      } catch (e) {
        console.error("Failed to parse stored bookmarks:", e);
        localStorage.removeItem(AI_BOOKMARKS_STORAGE_KEY);
      }
    }
  }, []);

  // Save bookmarks to localStorage
  useEffect(() => {
    localStorage.setItem(AI_BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  }, [bookmarks]);

  // Apply dark mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prevMode => !prevMode);
  }, []);

  const handleProcessUrls = useCallback(async (urlData: { url: string; addDate?: string }[]) => {
    if (!urlData.length) return;

    setIsLoading(true);
    setError(null);

    const existingUrls = new Set(bookmarks.filter(b => b.status !== 'error').map(b => b.url));
    const uniqueUrlData: { url: string; addDate?: string }[] = [];

    for (const data of urlData) {
        const cleanedUrl = stripUtmParams(data.url);
        if (!existingUrls.has(cleanedUrl)) {
            uniqueUrlData.push({ ...data, url: cleanedUrl });
            existingUrls.add(cleanedUrl);
        }
    }

    if (uniqueUrlData.length === 0) {
      setIsLoading(false);
      return;
    }

    const newBookmarks: Bookmark[] = uniqueUrlData.map(data => ({
      id: uuidv4(),
      url: data.url,
      title: 'Processing...',
      summary: '',
      keywords: [],
      status: 'processing',
      createdAt: data.addDate || new Date().toISOString(),
    }));

    setBookmarks(prev => [...prev, ...newBookmarks]);

    for (const bookmark of newBookmarks) {
      try {
        const details = await generateBookmarkDetails(bookmark.url);
        const isWarning = !details.summary || details.keywords.length === 0;

        setBookmarks(prev => prev.map(b => 
            b.id === bookmark.id 
            ? {
                ...bookmark,
                title: details.title,
                summary: details.summary || "AI summary generation failed.",
                keywords: details.keywords,
                sources: details.sources,
                createdAt: details.publicationDate ? new Date(details.publicationDate).toISOString() : bookmark.createdAt,
                status: isWarning ? 'warning' : 'done',
              }
            : b
        ));
      } catch (e: any) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        
        // Handle mandatory key re-selection on specific errors
        if (errorMessage.includes('Requested entity was not found') || errorMessage.includes('API key not valid')) {
          setError("Session expired or API key invalid. Please re-select your key.");
          setHasKey(false);
          setBookmarks(prev => prev.filter(b => b.status !== 'processing'));
          setIsLoading(false);
          return;
        }

        setBookmarks(prev => prev.map(b => 
            b.id === bookmark.id
            ? {
                ...bookmark,
                title: 'Error processing URL',
                summary: errorMessage,
                status: 'error' as const,
              }
            : b
        ));
      }

      // Respect rate limits
      if (newBookmarks.indexOf(bookmark) < newBookmarks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1100));
      }
    }
    
    setIsLoading(false);
  }, [bookmarks]);

  const handleUpdateBookmark = useCallback((updatedBookmark: Bookmark) => {
    setBookmarks(prev => prev.map(b => (b.id === updatedBookmark.id ? updatedBookmark : b)));
  }, []);

  const handleDeleteBookmark = useCallback((id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  }, []);
  
  const handleClearAll = useCallback(() => {
    setBookmarks([]);
  }, []);

  const handleRetryBookmark = useCallback(async (bookmarkId: string) => {
    const bookmarkToRetry = bookmarks.find(b => b.id === bookmarkId);
    if (!bookmarkToRetry) return;

    const cleanedUrl = stripUtmParams(bookmarkToRetry.url);
    setBookmarks(prev => prev.map(b => b.id === bookmarkId ? { ...b, status: 'processing', title: 'Retrying...' } : b));
    setError(null);

    try {
      const details = await generateBookmarkDetails(cleanedUrl);
      const isWarning = !details.summary || details.keywords.length === 0;

      setBookmarks(prev => prev.map(b =>
          b.id === bookmarkId
            ? {
                ...bookmarkToRetry,
                url: cleanedUrl,
                title: details.title,
                summary: details.summary || "AI summary generation failed.",
                keywords: details.keywords,
                sources: details.sources,
                createdAt: details.publicationDate ? new Date(details.publicationDate).toISOString() : bookmarkToRetry.createdAt,
                status: isWarning ? 'warning' : 'done',
              }
            : b
      ));
    } catch (e: any) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        if (errorMessage.includes('Requested entity was not found') || errorMessage.includes('API key not valid')) {
            setHasKey(false);
            setError("API key invalid. Please re-select.");
            return;
        }
        setBookmarks(prev => prev.map(b => b.id === bookmarkId ? { ...b, status: 'error' as const, summary: errorMessage, title: 'Retry failed' } : b));
    }
  }, [bookmarks]);

  if (hasKey === false) {
    return <ApiKeySetup onSelectKey={handleSelectKey} error={error} />;
  }

  // Prevent UI flicker while checking initial state
  if (hasKey === null) return null;

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-200 font-sans">
      <Header 
        bookmarks={bookmarks} 
        onClearAll={handleClearAll} 
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />
      <main className="container mx-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <UrlInput onProcess={handleProcessUrls} isLoading={isLoading} />
          {error && <div className="mt-4 text-center text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-lg" role="alert">{error}</div>}
          <BookmarkList
            bookmarks={bookmarks}
            onUpdate={handleUpdateBookmark}
            onDelete={handleDeleteBookmark}
            onRetry={handleRetryBookmark}
          />
        </div>
      </main>
    </div>
  );
};

export default App;

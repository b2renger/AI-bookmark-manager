import React, { useState, useCallback, useEffect } from 'react';
import { UrlInput } from './components/UrlInput';
import { BookmarkList } from './components/BookmarkList';
import { Header } from './components/Header';
import { generateBookmarkDetails, ApiKeyError } from './services/geminiService';
import { Bookmark } from './types';
import { v4 as uuidv4 } from 'uuid';

const AI_BOOKMARKS_STORAGE_KEY = 'ai-bookmark-manager-bookmarks';
const THEME_STORAGE_KEY = 'ai-bookmark-manager-theme';

// Helper function to remove UTM tracking parameters from a URL
const stripUtmParams = (urlString: string): string => {
  if (!urlString || !urlString.includes('utm_')) return urlString; // Quick check for performance
  try {
    const url = new URL(urlString);
    const params = url.searchParams;
    
    // Get all keys and filter for UTM params
    const keysToDelete = Array.from(params.keys()).filter(key => key.startsWith('utm_'));
    
    if (keysToDelete.length > 0) {
        keysToDelete.forEach(key => params.delete(key));
        return url.toString();
    }
    
    // Return original if no UTM keys were found, preserving original string format
    return urlString; 
  } catch (e) {
    // If URL parsing fails (e.g., no protocol), return the original string.
    // The Gemini API call will handle the invalid URL later.
    return urlString;
  }
};

const App: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);


  // Initialize dark mode from localStorage or system preference
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme !== null) {
        return storedTheme === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      console.error("Failed to read theme from localStorage:", e);
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  });

  // Load bookmarks from localStorage on initial mount
  useEffect(() => {
    const storedBookmarks = localStorage.getItem(AI_BOOKMARKS_STORAGE_KEY);
    if (storedBookmarks) {
      try {
        // Fix: Correctly type parsed bookmarks to allow for missing fields in legacy data.
        const parsedBookmarks: (Pick<Bookmark, 'url' | 'title' | 'summary' | 'keywords'> & Partial<Pick<Bookmark, 'id' | 'status' | 'createdAt' | 'sources'>>)[] = JSON.parse(storedBookmarks);
        // Simple migration for old bookmarks without a createdAt date
        const migratedBookmarks = parsedBookmarks.map(b => ({
            ...b,
            id: b.id || uuidv4(),
            status: b.status || 'done',
            createdAt: b.createdAt || new Date().toISOString(),
        })) as Bookmark[];
        setBookmarks(migratedBookmarks);
      } catch (e) {
        console.error("Failed to parse stored bookmarks from localStorage:", e);
        // Clear corrupted data to prevent future errors
        localStorage.removeItem(AI_BOOKMARKS_STORAGE_KEY);
      }
    }
  }, []); // Empty dependency array means this runs once on mount

  // Save bookmarks to localStorage whenever the bookmarks state changes
  useEffect(() => {
    localStorage.setItem(AI_BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  }, [bookmarks]); // Dependency array includes 'bookmarks'

  // Apply dark mode class to HTML element and save preference
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
    } catch (e) {
      console.error("Failed to save theme to localStorage:", e);
    }
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prevMode => !prevMode);
  }, []);

  const handleProcessUrls = useCallback(async (urlData: { url: string; addDate?: string }[]) => {
    if (!urlData.length) return;

    setIsLoading(true);
    setError(null);

    // Clean URLs and filter out any that are already queued, completed, or duplicated in the new batch.
    const existingUrls = new Set(bookmarks.filter(b => b.status !== 'error').map(b => b.url));
    const uniqueUrlData: { url: string; addDate?: string }[] = [];

    for (const data of urlData) {
        const cleanedUrl = stripUtmParams(data.url);
        if (!existingUrls.has(cleanedUrl)) {
            uniqueUrlData.push({ ...data, url: cleanedUrl });
            existingUrls.add(cleanedUrl); // Add to set to handle duplicates within the same batch
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
      // Prioritize the imported bookmark date, otherwise use the current date.
      createdAt: data.addDate || new Date().toISOString(),
    }));

    // Add bookmarks in 'processing' state to the UI immediately. They are added to the end.
    setBookmarks(prev => [...prev, ...newBookmarks]);

    // Process bookmarks sequentially to avoid hitting API rate limits.
    for (const bookmark of newBookmarks) {
      try {
        const details = await generateBookmarkDetails(bookmark.url);
        
        const isWarning = !details.summary || details.keywords.length === 0;

        // Update the specific bookmark in the list with the fetched details.
        setBookmarks(prev => prev.map(b => 
            b.id === bookmark.id 
            ? {
                ...bookmark,
                title: details.title,
                summary: details.summary || "AI could not generate a summary. The content might be inaccessible, too short, or complex.",
                keywords: details.keywords,
                sources: details.sources,
                // Use AI date if available, otherwise keep the creation date
                createdAt: details.publicationDate ? new Date(details.publicationDate).toISOString() : bookmark.createdAt,
                status: isWarning ? 'warning' : 'done',
              }
            : b
        ));
      } catch (e) {
        if (e instanceof ApiKeyError) {
          setError("A valid API key is required. Please ensure it's configured correctly.");
          
          // Clean up all bookmarks from this batch that are still processing.
          // Those that are 'done' can stay.
          const newBookmarkIds = new Set(newBookmarks.map(nb => nb.id));
          setBookmarks(prev => prev.filter(b => {
              // Keep if it's not part of the new batch, or if it is but it's not processing anymore
              return !newBookmarkIds.has(b.id) || b.status !== 'processing';
          }));
          
          setIsLoading(false); // Stop the main loading indicator
          return; // Stop processing further bookmarks
        }
        
        console.error(`Failed to process URL ${bookmark.url}:`, e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        // Update the bookmark with an error state.
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

      // Add a small delay between API calls to stay under the rate limit.
      // No delay needed after the last item.
      if (newBookmarks.indexOf(bookmark) < newBookmarks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1100)); // Just over 1s for ~55 RPM
      }
    }
    
    setIsLoading(false); // All bookmarks processed.
  }, [bookmarks]);

  const handleUpdateBookmark = useCallback((updatedBookmark: Bookmark) => {
    setBookmarks(prev =>
      prev.map(b => (b.id === updatedBookmark.id ? updatedBookmark : b))
    );
  }, []);

  const handleDeleteBookmark = useCallback((id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  }, []);
  
  const handleClearAll = useCallback(() => {
    setBookmarks([]);
  }, []);

  const handleRetryBookmark = useCallback(async (bookmarkId: string) => {
    const bookmarkToRetry = bookmarks.find(b => b.id === bookmarkId);
    if (!bookmarkToRetry || (bookmarkToRetry.status !== 'error' && bookmarkToRetry.status !== 'warning')) {
      return;
    }

    const cleanedUrl = stripUtmParams(bookmarkToRetry.url);

    // Set loading state for the specific bookmark for immediate feedback
    setBookmarks(prev =>
      prev.map(b =>
        b.id === bookmarkId
          ? { ...b, url: cleanedUrl, status: 'processing', title: 'Processing...', summary: '' }
          : b
      )
    );
    setError(null);

    try {
      const details = await generateBookmarkDetails(cleanedUrl);

      const isWarning = !details.summary || details.keywords.length === 0;

      setBookmarks(prev =>
        prev.map(b =>
          b.id === bookmarkId
            ? {
                ...bookmarkToRetry,
                url: cleanedUrl,
                title: details.title,
                summary: details.summary || "AI could not generate a summary. The content might be inaccessible, too short, or complex.",
                keywords: details.keywords,
                sources: details.sources,
                createdAt: details.publicationDate ? new Date(details.publicationDate).toISOString() : bookmarkToRetry.createdAt,
                status: isWarning ? 'warning' : 'done',
              }
            : b
        )
      );
    } catch (e) {
        if (e instanceof ApiKeyError) {
            setError("A valid API key is required. Please ensure it's configured correctly.");
        }
        console.error(`Failed to re-process URL ${cleanedUrl}:`, e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        setBookmarks(prev =>
            prev.map(b =>
                b.id === bookmarkId
                    ? { ...bookmarkToRetry, url: cleanedUrl, status: 'error' as const, summary: errorMessage, title: 'Error processing URL' }
                    : b
            )
        );
    }
  }, [bookmarks]);

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
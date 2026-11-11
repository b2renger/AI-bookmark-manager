
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UrlInput } from './components/UrlInput';
import { BookmarkList } from './components/BookmarkList';
import { Header } from './components/Header';
import { SettingsModal } from './components/SettingsModal';
import { NotionSyncModal } from './components/NotionSyncModal';
import { BulkActionBar } from './components/BulkActionBar';
import { PwaControls } from './components/PwaControls';
import { analyzeUrl, pacingFor, BookmarkResult } from './services/analyze';
import { rateLimitCount, resetRateLimitCount } from './services/ai/http';
import { loadAiKeys, loadAiSettings, providerProblem, saveAiKeys, saveAiSettings } from './services/ai/settings';
import { AiConfigError, AiKeys, AiSettings, isTransientError } from './services/ai/types';
import { LOCAL_PROXY } from './lib/proxyFetch';
import { Bookmark } from './types';

const AI_BOOKMARKS_STORAGE_KEY = 'ai-bookmark-manager-bookmarks';
const THEME_STORAGE_KEY = 'ai-bookmark-manager-theme';
const X_API_KEY_STORAGE_KEY = 'ai-bookmark-manager-x-api-key';
const NOTION_CONFIG_STORAGE_KEY = 'ai-bookmark-manager-notion-config';

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** The dev server's proxy only exists when the app is served by `npm run dev`. */
const isLocalHost = (): boolean => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

/** A bookmark the model could not really summarise is flagged, never passed off as done. */
const needsAttention = (res: BookmarkResult): boolean => !res.summary || res.summary.length < 10;

const applyResult = (b: Bookmark, res: BookmarkResult): Bookmark => ({
  ...b,
  title: res.title,
  summary: res.summary,
  keywords: res.keywords,
  sources: res.sources,
  confidenceScore: res.confidenceScore,
  confidenceReason: res.confidenceReason,
  platform: res.platform,
  author: res.author,
  thumbnailUrl: res.thumbnailUrl,
  // Prefer a publication date stated by the page; otherwise keep the imported date.
  createdAt: res.publicationDate || b.createdAt,
  status: needsAttention(res) ? 'warning' : 'done',
  errorMessage: undefined,
});

const playSuccessChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // A soft, elegant ascending arpeggio (Cmaj9)
    playNote(523.25, now, 1.5);       // C5
    playNote(659.25, now + 0.1, 1.5); // E5
    playNote(783.99, now + 0.2, 2.0); // G5
    playNote(987.77, now + 0.3, 2.5); // B5
    playNote(1174.66, now + 0.4, 3.0); // D6
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

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

/**
 * Read once, as the initial state. Loading in an effect let the "save" effect
 * write an empty list first, which could erase the stored bookmarks.
 */
const loadStoredBookmarks = (): Bookmark[] => {
  try {
    const stored = localStorage.getItem(AI_BOOKMARKS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((b: any) => ({
      ...b,
      // Ensure legacy data has a keywords array
      keywords: Array.isArray(b.keywords) ? b.keywords : [],
      // Nothing is running right after a load: an item still marked as
      // processing was cut off by a reload or by closing the app.
      ...(b.status === 'processing'
        ? {
            status: 'error',
            errorMessage: 'Interrupted before it finished. Press Retry.',
            title: /^(Queued|Reading page|Trying again|Updating|Processing batch)\.\.\.$/.test(b.title) ? 'Untitled' : b.title,
          }
        : {}),
    }));
  } catch (e) {
    return [];
  }
};

const App: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadStoredBookmarks);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Modal States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotionSyncOpen, setIsNotionSyncOpen] = useState(false);

  // Wake Lock Reference
  const wakeLockRef = useRef<any>(null);

  // Settings
  const [xApiKey, setXApiKey] = useState<string>('');
  const [notionConfig, setNotionConfig] = useState<{ apiKey: string; proxyUrl: string }>({ 
    apiKey: '', 
    proxyUrl: '' 
  });
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [aiKeys, setAiKeys] = useState<AiKeys>(() => loadAiKeys());

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
    const storedXKey = localStorage.getItem(X_API_KEY_STORAGE_KEY);
    if (storedXKey) {
        setXApiKey(storedXKey);
    }
    const storedNotionConfig = localStorage.getItem(NOTION_CONFIG_STORAGE_KEY);
    if (storedNotionConfig) {
        try {
            const parsedConfig = JSON.parse(storedNotionConfig);
            // The built-in proxy belonged to the old server. It only exists
            // now when running the dev server locally.
            if (parsedConfig && parsedConfig.proxyUrl === LOCAL_PROXY && !isLocalHost()) {
                parsedConfig.proxyUrl = '';
            }
            setNotionConfig(parsedConfig);
        } catch (e) {
             // reset if corrupted
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

  // Wake Lock Management
  useEffect(() => {
    const requestWakeLock = async () => {
      if (isLoading && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          // Silently catch wake lock errors to avoid console noise, as some environments block it
        }
      }
    };

    const releaseWakeLock = async () => {
      if (!isLoading && wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (err) {
          // Silently catch wake lock release errors
        }
      }
    };

    if (isLoading) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isLoading) {
        requestWakeLock();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isLoading]);

  const toggleDarkMode = useCallback(() => setIsDarkMode(prev => !prev), []);

  const handleSaveXApiKey = useCallback((key: string) => {
    setXApiKey(key);
    localStorage.setItem(X_API_KEY_STORAGE_KEY, key);
  }, []);

  const handleSaveNotionConfig = useCallback((config: { apiKey: string; proxyUrl: string }) => {
    setNotionConfig(config);
    localStorage.setItem(NOTION_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, []);

  const handleSaveAi = useCallback((settings: AiSettings, keys: AiKeys) => {
    setAiSettings(settings);
    setAiKeys(keys);
    saveAiSettings(settings);
    saveAiKeys(keys);
    setError(null);
  }, []);

  const aiProblem = providerProblem(aiSettings, aiKeys);

  const handleProcessUrls = useCallback(async (urlData: { url: string; addDate?: string }[]) => {
    if (!urlData.length) return;

    const problem = providerProblem(aiSettings, aiKeys);
    if (problem) {
      setError(problem);
      setIsSettingsOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    handleClearSelection(); // Clear selection on new import

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
      id: newId(),
      url: data.url,
      title: 'Queued...',
      summary: '',
      keywords: [],
      status: 'processing',
      createdAt: data.addDate || new Date().toISOString(),
    }));

    setBookmarks(prev => [...prev, ...newEntries]);

    const config = { settings: aiSettings, keys: aiKeys, xApiKey, proxyUrl: notionConfig.proxyUrl };
    const pacing = pacingFor(aiSettings);
    const untitle = (b: Bookmark) => (/^(Reading page|Queued|Trying again)\.\.\.$/.test(b.title) ? 'Untitled' : b.title);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    resetRateLimitCount(pacing.label);
    let nextStart = 0;
    let configFailure: string | null = null;

    // Spaces out request starts. Each time the service says "slow down", the
    // gap widens for the rest of this import (up to four times the base).
    const waitForSlot = async () => {
        if (pacing.intervalMs <= 0) return;
        const gap = pacing.intervalMs * Math.min(4, 1 + rateLimitCount(pacing.label));
        const startAt = Math.max(Date.now(), nextStart);
        nextStart = startAt + gap;
        const wait = startAt - Date.now();
        if (wait > 0) await sleep(wait);
    };

    /** Runs the given entries through a small pool. Returns those worth one more try. */
    const runPool = async (entries: Bookmark[], label: string): Promise<Bookmark[]> => {
        const retryable: Bookmark[] = [];
        let cursor = 0;

        const worker = async () => {
            while (!configFailure) {
                const entry = entries[cursor++];
                if (!entry) return;

                await waitForSlot();
                if (configFailure) return;

                setBookmarks(prev => prev.map(b => (b.id === entry.id ? { ...b, title: label, status: 'processing', errorMessage: undefined } : b)));

                try {
                    // One URL per request, so nothing leaks between bookmarks.
                    const res = await analyzeUrl(entry.url, config);
                    setBookmarks(prev => prev.map(b => (b.id === entry.id && b.status === 'processing' ? applyResult(b, res) : b)));
                } catch (e: any) {
                    const msg = e instanceof Error ? e.message : String(e);
                    // A configuration problem will fail every remaining URL the same way.
                    if (e instanceof AiConfigError) {
                        configFailure = msg;
                        return;
                    }
                    if (isTransientError(e)) retryable.push(entry);
                    setBookmarks(prev => prev.map(b =>
                        b.id === entry.id ? { ...b, title: untitle(b), status: 'error', errorMessage: msg } : b
                    ));
                }
            }
        };

        await Promise.all(Array.from({ length: Math.min(pacing.concurrency, entries.length) }, worker));
        return retryable;
    };

    const failed = await runPool(newEntries, 'Reading page...');

    // Overload and dropped connections usually clear within seconds: give
    // those links one more go before handing them back to the user.
    if (!configFailure && failed.length > 0) {
        await sleep(12000);
        await runPool(failed, 'Trying again...');
    }

    if (configFailure) {
        const message = configFailure;
        const ids = new Set(newEntries.map(b => b.id));
        setError(message);
        setBookmarks(prev => prev.map(b =>
            ids.has(b.id) && b.status === 'processing'
                ? { ...b, title: untitle(b), status: 'error', errorMessage: message }
                : b
        ));
        setIsLoading(false);
        return;
    }

    setIsLoading(false);
    playSuccessChime();
  }, [bookmarks, xApiKey, notionConfig.proxyUrl, aiSettings, aiKeys]);

  const handleUpdateBookmark = useCallback((updated: Bookmark) => {
    setBookmarks(prev => prev.map(b => (b.id === updated.id ? updated : b)));
  }, []);

  const handleDeleteBookmark = useCallback((id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
    setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
    });
  }, []);
  
  const handleClearAll = useCallback(() => {
      setBookmarks([]);
      setSelectedIds(new Set());
  }, []);

  const handleRetryBookmark = useCallback(async (id: string) => {
    const target = bookmarks.find(b => b.id === id);
    if (!target) return;

    const problem = providerProblem(aiSettings, aiKeys);
    if (problem) {
      setError(problem);
      setIsSettingsOpen(true);
      return;
    }

    const previousTitle = target.title;
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, status: 'processing', title: 'Updating...' } : b));

    try {
        const res = await analyzeUrl(target.url, { settings: aiSettings, keys: aiKeys, xApiKey, proxyUrl: notionConfig.proxyUrl });
        setError(null);
        setBookmarks(prev => prev.map(b => (b.id === id ? applyResult(b, res) : b)));
    } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof AiConfigError) setError(msg);
        setBookmarks(prev => prev.map(b => b.id === id ? { ...b, status: 'error', errorMessage: msg || "Retry failed", title: previousTitle || 'Untitled' } : b));
    }
  }, [bookmarks, xApiKey, notionConfig.proxyUrl, aiSettings, aiKeys]);

  // Selection Handlers
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((ids: string[]) => {
      setSelectedIds(new Set(ids));
  }, []);

  const handleClearSelection = useCallback(() => {
      setSelectedIds(new Set());
  }, []);

  const handleBulkAddKeyword = useCallback((keyword: string) => {
      setBookmarks(prev => prev.map(b => {
          if (selectedIds.has(b.id)) {
              // Ensure keywords array exists
              const currentKeywords = Array.isArray(b.keywords) ? b.keywords : [];
              // Case insensitive check to avoid duplicates
              if (!currentKeywords.some(k => k.toLowerCase() === keyword.toLowerCase())) {
                  return { ...b, keywords: [...currentKeywords, keyword] };
              }
          }
          return b;
      }));
  }, [selectedIds]);

  const handleClearSuccessful = useCallback((successfulIds: string[]) => {
      const successSet = new Set(successfulIds);
      setBookmarks(prev => prev.filter(b => !successSet.has(b.id)));
      setSelectedIds(prev => {
          const next = new Set(prev);
          successfulIds.forEach(id => next.delete(id));
          return next;
      });
  }, []);

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-200 relative">
      <Header 
        bookmarks={bookmarks} 
        onClearAll={handleClearAll} 
        isDarkMode={isDarkMode} 
        onToggleDarkMode={toggleDarkMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenNotionSync={() => setIsNotionSyncOpen(true)}
      />
      <main className="container mx-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <UrlInput onProcess={handleProcessUrls} isLoading={isLoading} onOpenSettings={() => setIsSettingsOpen(true)} setupHint={aiProblem} />
          {error && <div className="mt-4 text-center text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-lg shadow-sm border border-red-200 dark:border-red-800">{error}</div>}
          <BookmarkList 
            bookmarks={bookmarks} 
            onUpdate={handleUpdateBookmark} 
            onDelete={handleDeleteBookmark} 
            onRetry={handleRetryBookmark}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
          />
        </div>
      </main>
      
      {selectedIds.size > 0 && (
          <BulkActionBar 
             selectedCount={selectedIds.size}
             onClearSelection={handleClearSelection}
             onAddKeyword={handleBulkAddKeyword}
          />
      )}
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        xApiKey={xApiKey} 
        onSaveXApiKey={handleSaveXApiKey}
        notionConfig={notionConfig}
        onSaveNotionConfig={handleSaveNotionConfig}
        aiSettings={aiSettings}
        aiKeys={aiKeys}
        onSaveAi={handleSaveAi}
      />

      <PwaControls busy={isLoading} />

      <NotionSyncModal 
        isOpen={isNotionSyncOpen}
        onClose={() => setIsNotionSyncOpen(false)}
        bookmarks={bookmarks.filter(b => b.status === 'done' || b.status === 'warning')}
        notionConfig={notionConfig}
        onOpenSettings={() => {
            setIsNotionSyncOpen(false);
            setIsSettingsOpen(true);
        }}
        onClearSuccessful={handleClearSuccessful}
      />
    </div>
  );
};

export default App;

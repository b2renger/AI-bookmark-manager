import React, { useState, useMemo } from 'react';
import { Bookmark } from '../types';
import { BookmarkItem } from './BookmarkItem';
import { XTwitterIcon } from './common/Icons';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Sparkles, 
  Play, 
  AtSign, 
  Globe, 
  CheckSquare, 
  Square,
  ShieldCheck
} from 'lucide-react';

interface BookmarkListProps {
  bookmarks: Bookmark[];
  onUpdate: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
}

type PlatformFilter = 'all' | 'youtube' | 'threads' | 'twitter' | 'web';
type SortOption = 'date-desc' | 'date-asc' | 'confidence-desc' | 'confidence-asc' | 'title';

export const BookmarkList: React.FC<BookmarkListProps> = ({ 
  bookmarks, 
  onUpdate, 
  onDelete, 
  onRetry,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');

  // Calculate platform metrics
  const platformCounts = useMemo(() => {
    let yt = 0, threads = 0, x = 0, web = 0;
    bookmarks.forEach(b => {
      const lower = b.url.toLowerCase();
      if (b.platform === 'youtube' || lower.includes('youtube.com') || lower.includes('youtu.be')) yt++;
      else if (b.platform === 'threads' || lower.includes('threads.net') || lower.includes('threads.com')) threads++;
      else if (b.platform === 'twitter' || lower.includes('twitter.com') || lower.includes('x.com')) x++;
      else web++;
    });
    return { all: bookmarks.length, youtube: yt, threads: threads, twitter: x, web };
  }, [bookmarks]);

  // Average confidence score
  const avgConfidence = useMemo(() => {
    const scored = bookmarks.filter(b => typeof b.confidenceScore === 'number');
    if (scored.length === 0) return null;
    const total = scored.reduce((acc, b) => acc + (b.confidenceScore || 0), 0);
    return Math.round(total / scored.length);
  }, [bookmarks]);

  // Filtered & Sorted bookmarks
  const processedBookmarks = useMemo(() => {
    return bookmarks
      .filter(b => {
        // Platform filter
        const lower = b.url.toLowerCase();
        if (platformFilter === 'youtube' && !(b.platform === 'youtube' || lower.includes('youtube.com') || lower.includes('youtu.be'))) return false;
        if (platformFilter === 'threads' && !(b.platform === 'threads' || lower.includes('threads.net') || lower.includes('threads.com'))) return false;
        if (platformFilter === 'twitter' && !(b.platform === 'twitter' || lower.includes('twitter.com') || lower.includes('x.com'))) return false;
        if (platformFilter === 'web') {
          const isSpecial = lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('threads.net') || lower.includes('threads.com') || lower.includes('twitter.com') || lower.includes('x.com');
          if (isSpecial) return false;
        }

        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesTitle = b.title.toLowerCase().includes(q);
          const matchesUrl = b.url.toLowerCase().includes(q);
          const matchesSummary = b.summary.toLowerCase().includes(q);
          const matchesAuthor = b.author?.toLowerCase().includes(q) || false;
          const matchesKeywords = b.keywords.some(k => k.toLowerCase().includes(q));
          return matchesTitle || matchesUrl || matchesSummary || matchesAuthor || matchesKeywords;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'date-desc') {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        if (sortOption === 'date-asc') {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        if (sortOption === 'confidence-desc') {
          return (b.confidenceScore ?? -1) - (a.confidenceScore ?? -1);
        }
        if (sortOption === 'confidence-asc') {
          return (a.confidenceScore ?? 101) - (b.confidenceScore ?? 101);
        }
        if (sortOption === 'title') {
          return a.title.localeCompare(b.title);
        }
        return 0;
      });
  }, [bookmarks, platformFilter, searchQuery, sortOption]);

  if (bookmarks.length === 0) {
    return (
      <div className="text-center py-16 px-6 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-sm">
        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/60 rounded-2xl flex items-center justify-center mx-auto mb-3 text-blue-600 dark:text-blue-400">
          <Sparkles className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">No bookmarks yet</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          Paste YouTube videos, Threads posts, X/Twitter links, or article URLs above to generate summaries with confidence ratings.
        </p>
      </div>
    );
  }

  const allVisibleSelected = processedBookmarks.length > 0 && processedBookmarks.every(b => selectedIds.has(b.id));

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      onClearSelection();
    } else {
      onSelectAll(processedBookmarks.map(b => b.id));
    }
  };

  return (
    <div className="space-y-4 pb-24">
      
      {/* Controls Bar: Search, Filters & Sorting */}
      <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 p-3.5 rounded-2xl shadow-sm space-y-3">
        
        {/* Top Search & Stats */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, keyword, author, or URL..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Sort:</span>
            </div>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="text-xs font-medium px-3 py-2 bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="confidence-desc">Highest Confidence</option>
              <option value="confidence-asc">Lowest Confidence</option>
              <option value="title">Title (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Filter Pills & Select All */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
          
          {/* Platform Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setPlatformFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                platformFilter === 'all'
                  ? 'bg-blue-600 text-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All ({platformCounts.all})
            </button>
            
            {platformCounts.youtube > 0 && (
              <button
                onClick={() => setPlatformFilter('youtube')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  platformFilter === 'youtube'
                    ? 'bg-red-600 text-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Play className="w-3 h-3 fill-current" />
                <span>YouTube ({platformCounts.youtube})</span>
              </button>
            )}

            {platformCounts.threads > 0 && (
              <button
                onClick={() => setPlatformFilter('threads')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  platformFilter === 'threads'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <AtSign className="w-3 h-3" />
                <span>Threads ({platformCounts.threads})</span>
              </button>
            )}

            {platformCounts.twitter > 0 && (
              <button
                onClick={() => setPlatformFilter('twitter')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  platformFilter === 'twitter'
                    ? 'bg-sky-500 text-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <XTwitterIcon className="w-3 h-3 fill-current" />
                <span>X ({platformCounts.twitter})</span>
              </button>
            )}

            {platformCounts.web > 0 && (
              <button
                onClick={() => setPlatformFilter('web')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  platformFilter === 'web'
                    ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Globe className="w-3 h-3" />
                <span>Web ({platformCounts.web})</span>
              </button>
            )}
          </div>

          {/* Average Confidence badge */}
          {avgConfidence !== null && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-750 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Avg Confidence: <strong className="text-slate-700 dark:text-slate-200">{avgConfidence}%</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Select All Row */}
      <div className="flex items-center justify-between px-2">
        <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-400 select-none hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
          <input 
            type="checkbox" 
            checked={allVisibleSelected} 
            onChange={handleToggleSelectAll}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
          />
          <span>Select all visible ({processedBookmarks.length})</span>
        </label>

        {selectedIds.size > 0 && (
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            {selectedIds.size} selected
          </span>
        )}
      </div>

      {/* Bookmarks List */}
      {processedBookmarks.length === 0 ? (
        <div className="text-center py-12 px-6 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No bookmarks matched your filter or search query.</p>
          <button
            onClick={() => { setPlatformFilter('all'); setSearchQuery(''); }}
            className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Reset filters
          </button>
        </div>
      ) : (
        processedBookmarks.map((bookmark) => (
          <BookmarkItem 
            key={bookmark.id} 
            bookmark={bookmark} 
            onUpdate={onUpdate} 
            onDelete={onDelete} 
            onRetry={onRetry} 
            isSelected={selectedIds.has(bookmark.id)}
            onToggleSelect={onToggleSelect}
          />
        ))
      )}
    </div>
  );
};

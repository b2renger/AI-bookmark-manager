import React, { useState, useEffect, useRef } from 'react';
import { Bookmark } from '../types';
import { Spinner } from './common/Spinner';
import { ExternalLinkIcon, TrashIcon, CloseIcon, CalendarIcon, RetryIcon, WarningIcon, XTwitterIcon, GitHubIcon } from './common/Icons';
import { 
  Sparkles, 
  ShieldCheck, 
  AlertCircle, 
  Info, 
  Play, 
  AtSign, 
  Globe, 
  FileText,
  User
} from 'lucide-react';

interface BookmarkItemProps {
  bookmark: Bookmark;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onUpdate: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  /** Writes a title and keywords from the summary on the card. */
  onTitleAndTagsFromSummary: (id: string) => void;
  /** True while that request is running. */
  isGenerating: boolean;
}

/** A hand-written summary shorter than this gives the model too little to work with. */
const MIN_SUMMARY_FOR_GENERATION = 20;

const EditableField: React.FC<{ value: string; onSave: (newValue: string) => void; isTextArea?: boolean }> = ({ value, onSave, isTextArea = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    onSave(currentValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isTextArea) {
      handleSave();
    } else if (e.key === 'Escape') {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    if (isTextArea) {
      return (
        <textarea
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          rows={3}
          className="w-full text-sm p-2.5 bg-white dark:bg-slate-700 border-2 border-blue-500 rounded-lg shadow-inner focus:outline-none"
          aria-label="Edit summary"
        />
      );
    }
    return (
      <input
        ref={inputRef as React.Ref<HTMLInputElement>}
        type="text"
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full px-2 py-1 bg-white dark:bg-slate-700 border-2 border-blue-500 rounded-lg shadow-inner focus:outline-none"
        aria-label="Edit title"
      />
    );
  }
  
  return (
    <span 
      onClick={() => setIsEditing(true)} 
      className={`cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 p-1 -m-1 rounded-md transition-colors inline-block min-w-[50px] ${!value ? 'text-slate-400 italic' : ''}`}
      title="Click to edit"
    >
      {value || (isTextArea ? 'Click to add summary...' : 'Click to add title...')}
    </span>
  );
};

const ConfidenceBadge: React.FC<{ score?: number; reason?: string }> = ({ score, reason }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (typeof score !== 'number') return null;

  let colorClass = 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  let levelText = 'Moderate';
  let barColor = 'bg-slate-500';

  if (score >= 85) {
    colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
    levelText = 'High';
    barColor = 'bg-emerald-500';
  } else if (score >= 60) {
    colorClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
    levelText = 'Moderate';
    barColor = 'bg-amber-500';
  } else {
    colorClass = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60';
    levelText = 'Low';
    barColor = 'bg-rose-500';
  }

  return (
    <div className="relative inline-flex items-center">
      <div 
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(prev => !prev)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer select-none transition-transform hover:scale-105 ${colorClass}`}
        title="AI description confidence score"
      >
        <span className="flex items-center gap-1">
          {score >= 85 ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : score >= 60 ? (
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          )}
          <span>{score}% Confidence</span>
        </span>
        <div className="w-8 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden ml-0.5">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
        </div>
      </div>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-slate-100 text-xs rounded-xl shadow-xl z-30 border border-slate-700 animate-fade-in pointer-events-none">
          <div className="flex items-center justify-between font-semibold mb-1 border-b border-slate-700/80 pb-1">
            <span>AI Confidence: {score}% ({levelText})</span>
            <Info className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className="text-slate-300 leading-relaxed">
            {reason || (score >= 85 ? "Verified via direct metadata and retrieved page context." : "Generated using web search grounding and partial context.")}
          </p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
};

const PlatformBadge: React.FC<{ platform?: string; url: string; author?: string }> = ({ platform, url, author }) => {
  const lowerUrl = url.toLowerCase();
  
  if (platform === 'youtube' || lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    const isShort = lowerUrl.includes('/shorts/');
    const isPlaylist = lowerUrl.includes('list=');
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60">
        <Play className="w-3 h-3 fill-current" />
        <span>YouTube {isShort ? 'Short' : isPlaylist ? 'Playlist' : 'Video'}</span>
        {author && <span className="opacity-80 font-normal">· {author}</span>}
      </span>
    );
  }

  if (platform === 'threads' || lowerUrl.includes('threads.net') || lowerUrl.includes('threads.com')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600">
        <AtSign className="w-3 h-3" />
        <span>Threads</span>
        {author && <span className="opacity-80 font-normal">· {author.startsWith('@') ? author : `@${author}`}</span>}
      </span>
    );
  }

  if (platform === 'twitter' || lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60">
        <XTwitterIcon className="w-3 h-3 fill-current" />
        <span>X / Twitter</span>
        {author && <span className="opacity-80 font-normal">· {author.startsWith('@') ? author : `@${author}`}</span>}
      </span>
    );
  }

  if (platform === 'github' || lowerUrl.includes('github.com')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60">
        <GitHubIcon className="w-3 h-3 fill-current" />
        <span>GitHub</span>
      </span>
    );
  }

  if (platform === 'article') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60">
        <FileText className="w-3 h-3" />
        <span>Article</span>
        {author && <span className="opacity-80 font-normal">· {author}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
      <Globe className="w-3 h-3" />
      <span>Web</span>
    </span>
  );
};

const formatDate = (isoString: string) => {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (e) {
    return 'Invalid Date';
  }
};

export const BookmarkItem: React.FC<BookmarkItemProps> = ({ 
  bookmark, 
  isSelected, 
  onToggleSelect, 
  onUpdate, 
  onDelete, 
  onRetry,
  onTitleAndTagsFromSummary,
  isGenerating
}) => {
  const handleTitleUpdate = (newTitle: string) => {
    onUpdate({ ...bookmark, title: newTitle });
  };
  
  const handleSummaryUpdate = (newSummary: string) => {
    onUpdate({ ...bookmark, summary: newSummary });
  };

  const handleKeywordRemove = (indexToRemove: number) => {
    const keywords = Array.isArray(bookmark.keywords) ? bookmark.keywords : [];
    const newKeywords = keywords.filter((_, index) => index !== indexToRemove);
    onUpdate({ ...bookmark, keywords: newKeywords });
  };

  const handleKeywordAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const inputElement = e.target as HTMLInputElement;
      const newKeyword = inputElement.value.trim();
      const currentKeywords = Array.isArray(bookmark.keywords) ? bookmark.keywords : [];

      if (newKeyword && !currentKeywords.some(k => k.toLowerCase() === newKeyword.toLowerCase())) {
        const newKeywords = [...currentKeywords, newKeyword];
        onUpdate({ ...bookmark, keywords: newKeywords });
        inputElement.value = '';
      }
      e.preventDefault();
    }
  };

  const isYouTube = bookmark.url.includes('youtube.com') || bookmark.url.includes('youtu.be');

  return (
    <div 
      className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 sm:p-5 rounded-2xl shadow-sm hover:shadow-md transition-all ${bookmark.status === 'warning' ? 'ring-2 ring-amber-500/80' : ''} ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50/40 dark:bg-slate-800' : ''}`} 
      aria-live="polite"
    >
      <div className="flex gap-3 sm:gap-4">
        {/* Checkbox Section */}
        <div className="pt-1 flex-shrink-0">
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={() => onToggleSelect(bookmark.id)}
            className="w-5 h-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            aria-label={`Select bookmark ${bookmark.title}`}
          />
        </div>

        {/* Content Section */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              
              {/* Badges row: Platform, Author & Confidence Score */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <PlatformBadge platform={bookmark.platform} url={bookmark.url} author={bookmark.author} />
                
                {bookmark.status === 'done' && (
                  <ConfidenceBadge score={bookmark.confidenceScore} reason={bookmark.confidenceReason} />
                )}

                {bookmark.createdAt && (
                  <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                    <CalendarIcon className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                    <span>{formatDate(bookmark.createdAt)}</span>
                  </div>
                )}
              </div>

              {/* Title with inline edit */}
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-1.5 flex-wrap">
                {bookmark.status === 'processing' ? (
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Spinner />
                    {bookmark.title}
                  </span>
                ) : (
                  <EditableField value={bookmark.title} onSave={handleTitleUpdate} />
                )}
              </h3>

              {/* URL */}
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all inline-flex items-center gap-1"
                aria-label={`Open link ${bookmark.url}`}
              >
                <span>{bookmark.url}</span>
              </a>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center space-x-1 flex-shrink-0">
              {bookmark.status === 'processing' && <Spinner />}
              <a 
                href={bookmark.url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors" 
                title="Open link in new tab"
              >
                <ExternalLinkIcon className="w-4 h-4" />
              </a>
              {bookmark.status !== 'processing' && (
                <button 
                  onClick={() => onRetry(bookmark.id)} 
                  className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors" 
                  title="Re-analyze with AI"
                >
                  <RetryIcon className="w-4 h-4" />
                </button>
              )}
              <button 
                onClick={() => onDelete(bookmark.id)} 
                className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors" 
                title="Delete bookmark"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {bookmark.status !== 'processing' && (
            <div className="mt-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-700/60 space-y-3">
              
              {/* Error state alert */}
              {bookmark.status === 'error' && (
                <div className="text-red-600 bg-red-50 dark:bg-red-950/40 p-3 rounded-xl border border-red-200 dark:border-red-900/60" role="alert">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm">Failed to generate summary</p>
                      <p className="text-xs mt-0.5">{bookmark.errorMessage || 'An error occurred while fetching information.'}</p>
                    </div>
                    <button
                      onClick={() => onRetry(bookmark.id)}
                      className="ml-4 flex items-center space-x-1.5 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors flex-shrink-0"
                      title="Retry processing this bookmark"
                    >
                      <RetryIcon className="h-3.5 w-3.5" />
                      <span>Retry</span>
                    </button>
                  </div>
                </div>
              )}
              
              {/* Warning state alert */}
              {bookmark.status === 'warning' && (
                <div className="text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60" role="status">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-2">
                      <WarningIcon className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
                      <div>
                        <p className="font-semibold text-xs">Partial Information</p>
                        <p className="text-xs mt-0.5">The AI had trouble retrieving full details. You can retry or edit manually.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onRetry(bookmark.id)}
                      className="ml-4 flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-amber-900 dark:text-amber-100 bg-amber-100 dark:bg-amber-800/60 hover:bg-amber-200 dark:hover:bg-amber-700 rounded-lg transition-colors flex-shrink-0"
                      title="Retry processing this bookmark"
                    >
                      <RetryIcon className="h-3.5 w-3.5" />
                      <span>Retry</span>
                    </button>
                  </div>
                </div>
              )}

              {/* YouTube Thumbnail + Video Preview if present */}
              {bookmark.thumbnailUrl && isYouTube && (
                <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-100 dark:border-slate-700/50">
                  <div className="relative w-28 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900 group">
                    <img 
                      src={bookmark.thumbnailUrl} 
                      alt={bookmark.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    <a 
                      href={bookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity"
                    >
                      <div className="w-7 h-7 rounded-full bg-red-600 text-white dark:text-slate-900 flex items-center justify-center shadow-lg">
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </div>
                    </a>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 min-w-0">
                    <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{bookmark.author ? `Channel: ${bookmark.author}` : 'YouTube Media'}</p>
                    <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5">Click preview to open video</p>
                  </div>
                </div>
              )}

              {/* Summary with inline editable area */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Summary</span>
                </label>
                <div className="text-sm text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">
                  <EditableField value={bookmark.summary || ''} onSave={handleSummaryUpdate} isTextArea />
                </div>
                {/* Lets a hand-written summary drive the rest of the card. */}
                {(bookmark.summary || '').trim().length >= MIN_SUMMARY_FOR_GENERATION && (
                  <button
                    onClick={() => onTitleAndTagsFromSummary(bookmark.id)}
                    disabled={isGenerating}
                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-750 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
                    title="Write a new title and keywords from this summary. The summary itself is not changed."
                  >
                    {isGenerating ? <Spinner className="h-3.5 w-3.5 border-blue-500" /> : <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-300" />}
                    <span>{isGenerating ? 'Writing title and keywords…' : 'Title and keywords from this summary'}</span>
                  </button>
                )}
              </div>

              {/* Sources */}
              {bookmark.sources && bookmark.sources.length > 0 && (
                <div className="pt-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Sources Verified
                  </label>
                  <ul className="mt-1 list-disc list-inside text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                    {bookmark.sources.map((source, index) => (
                      <li key={index} className="truncate">
                        <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 hover:underline" title={source.title || source.uri}>
                          {source.title || source.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Keywords */}
              <div className="pt-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" id={`keywords-label-${bookmark.id}`}>
                  Keywords
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-1.5" role="group" aria-labelledby={`keywords-label-${bookmark.id}`}>
                  {(Array.isArray(bookmark.keywords) ? bookmark.keywords : []).map((keyword, index) => (
                    <span key={`${keyword}-${index}`} className="flex items-center bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {keyword}
                      <button 
                        onClick={() => handleKeywordRemove(index)} 
                        className="ml-1.5 -mr-1 p-0.5 rounded-full text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 focus:outline-none"
                        aria-label={`Remove keyword ${keyword}`}
                        title={`Remove ${keyword}`}
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    onKeyDown={handleKeywordAdd}
                    placeholder="+ Add tag..."
                    aria-label="Add a new keyword"
                    className="bg-transparent outline-none px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 border border-dashed border-slate-300 dark:border-slate-600 rounded-full hover:border-blue-400 focus:border-blue-500 min-w-[80px]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

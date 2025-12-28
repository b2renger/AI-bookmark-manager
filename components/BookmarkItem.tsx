import React, { useState, useEffect, useRef } from 'react';
import { Bookmark } from '../types';
import { Spinner } from './common/Spinner';
import { ExternalLinkIcon, TrashIcon, CloseIcon, CalendarIcon, RetryIcon, WarningIcon } from './common/Icons';

interface BookmarkItemProps {
  bookmark: Bookmark;
  onUpdate: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

const EditableField: React.FC<{ value: string, onSave: (newValue: string) => void, isTextArea?: boolean }> = ({ value, onSave, isTextArea = false }) => {
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
                    className="w-full text-sm p-2 bg-white dark:bg-slate-700 border border-blue-500 rounded-md shadow-inner"
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
                className="w-full p-1 -m-1 bg-white dark:bg-slate-700 border border-blue-500 rounded-md shadow-inner"
                aria-label="Edit title"
            />
        );
    }
    
    return (
        <span onClick={() => setIsEditing(true)} className="cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 p-1 -m-1 rounded-md">
            {value}
        </span>
    );
};

const AIBadge: React.FC = () => (
  <span className="ml-1 px-1.5 py-0.5 text-xs font-medium text-blue-800 bg-blue-100 dark:text-blue-200 dark:bg-blue-900/50 rounded-full select-none" aria-label="AI generated content">
    AI
  </span>
);

const formatDate = (isoString: string) => {
    if (!isoString) return '';
    try {
        return new Date(isoString).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    } catch (e) {
        return 'Invalid Date';
    }
};

export const BookmarkItem: React.FC<BookmarkItemProps> = ({ bookmark, onUpdate, onDelete, onRetry }) => {

  const handleTitleUpdate = (newTitle: string) => {
    onUpdate({ ...bookmark, title: newTitle });
  };
  
  const handleSummaryUpdate = (newSummary: string) => {
    onUpdate({ ...bookmark, summary: newSummary });
  };

  const handleKeywordRemove = (indexToRemove: number) => {
    const newKeywords = bookmark.keywords.filter((_, index) => index !== indexToRemove);
    onUpdate({ ...bookmark, keywords: newKeywords });
  };

  const handleKeywordAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          const inputElement = e.target as HTMLInputElement;
          const newKeyword = inputElement.value.trim();

          if (newKeyword && !bookmark.keywords.some(k => k.toLowerCase() === newKeyword.toLowerCase())) {
              const newKeywords = [...bookmark.keywords, newKeyword];
              onUpdate({ ...bookmark, keywords: newKeywords });
              inputElement.value = '';
          }
          e.preventDefault();
      }
  };

  const isPending = bookmark.status === 'processing' || bookmark.status === 'queued';
  const isQueued = bookmark.status === 'queued';

  return (
    <div className={`bg-white dark:bg-slate-800 p-5 rounded-xl shadow-md transition-all animate-fade-in ${bookmark.status === 'warning' ? 'ring-2 ring-amber-500' : ''} ${isQueued ? 'opacity-70 grayscale-[0.5]' : ''}`} aria-live="polite">
      <div className="flex justify-between items-start">
        <div className="flex-1 pr-4">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-1">
            {isPending ? (
                <span className="text-slate-500 italic">{bookmark.title}</span>
            ) : (
                <>
                    <EditableField value={bookmark.title} onSave={handleTitleUpdate} />
                    {(bookmark.status === 'done' || bookmark.status === 'warning') && <AIBadge />}
                </>
            )}
          </h3>
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 dark:text-blue-400 hover:underline break-all flex items-center gap-1"
            aria-label={`Open link ${bookmark.url}`}
          >
            {bookmark.url}
          </a>
          {bookmark.createdAt && (
            <div className="mt-2 flex items-center text-xs text-slate-500 dark:text-slate-400">
                <CalendarIcon className="h-4 w-4 mr-1.5 flex-shrink-0" />
                <span>{formatDate(bookmark.createdAt)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
            {bookmark.status === 'processing' && <Spinner />}
            {bookmark.status === 'queued' && <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full">Waiting...</span>}
            
             <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Open link">
                <ExternalLinkIcon />
            </a>
            <button onClick={() => onDelete(bookmark.id)} className="p-2 text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Delete bookmark">
                <TrashIcon />
            </button>
        </div>
      </div>

      {!isPending && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
           {bookmark.status === 'error' ? (
                <div className="text-red-500 bg-red-50 dark:bg-red-900/40 p-3 rounded-md" role="alert">
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="font-semibold">Error</p>
                          <p className="text-sm">{bookmark.summary}</p>
                      </div>
                      <button
                          onClick={() => onRetry(bookmark.id)}
                          className="ml-4 flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors flex-shrink-0"
                          title="Retry processing this bookmark"
                      >
                          <RetryIcon className="h-4 w-4" />
                          <span>Retry</span>
                      </button>
                  </div>
                </div>
            ) : (
                <>
                    {bookmark.status === 'warning' && (
                        <div className="mb-4 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/40 p-3 rounded-md" role="status">
                            <div className="flex justify-between items-start">
                                <div className="flex items-start">
                                    <WarningIcon className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0 text-amber-500" />
                                    <div>
                                        <p className="font-semibold">Partial Information</p>
                                        <p className="text-sm">The AI had trouble generating a complete summary or keywords. You can retry or edit the details manually.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onRetry(bookmark.id)}
                                    className="ml-4 flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors flex-shrink-0"
                                    title="Retry processing this bookmark"
                                >
                                    <RetryIcon className="h-4 w-4" />
                                    <span>Retry</span>
                                </button>
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            Summary {(bookmark.status === 'done' || bookmark.status === 'warning') && <AIBadge />}
                        </label>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            <EditableField value={bookmark.summary} onSave={handleSummaryUpdate} isTextArea />
                        </p>
                    </div>
                    {bookmark.sources && bookmark.sources.length > 0 && (
                        <div className="mt-4">
                            <label className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                                Sources
                            </label>
                            <ul className="mt-1 list-disc list-inside text-sm text-slate-600 dark:text-slate-300 space-y-1">
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
                    <div className="mt-4">
                        <label className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1" id={`keywords-label-${bookmark.id}`}>
                            Keywords {(bookmark.status === 'done' || bookmark.status === 'warning') && <AIBadge />}
                        </label>
                        <div className="mt-1 flex flex-wrap items-center gap-2" role="group" aria-labelledby={`keywords-label-${bookmark.id}`}>
                            {bookmark.keywords.map((keyword, index) => (
                                <span key={`${keyword}-${index}`} className="flex items-center bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 text-sm font-medium px-2 py-1 rounded-full">
                                    {keyword}
                                    <button 
                                        onClick={() => handleKeywordRemove(index)} 
                                        className="ml-1.5 -mr-1 p-0.5 rounded-full text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                placeholder="Add keyword..."
                                aria-label="Add a new keyword"
                                className="flex-grow bg-transparent outline-none p-1 text-sm border-b border-dashed border-slate-400 dark:border-slate-500 focus:border-solid focus:border-blue-500 min-w-[100px]"
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
      )}
    </div>
  );
};
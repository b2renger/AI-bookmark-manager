import React from 'react';
import { Bookmark } from '../types';
import { BookmarkItem } from './BookmarkItem';

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
  if (bookmarks.length === 0) {
    return (
      <div className="text-center py-12 px-6 bg-white dark:bg-slate-800 rounded-xl shadow-lg">
        <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">No bookmarks yet!</h2>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Paste some URLs above to get started.</p>
      </div>
    );
  }

  const allSelected = bookmarks.length > 0 && bookmarks.every(b => selectedIds.has(b.id));

  const handleToggleSelectAll = () => {
    if (allSelected) {
        onClearSelection();
    } else {
        onSelectAll(bookmarks.map(b => b.id));
    }
  };

  return (
    <div className="space-y-4 pb-24"> {/* Added padding bottom to account for floating bar */}
      <div className="flex items-center justify-between px-2 mb-2">
          <label className="flex items-center space-x-3 cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-400 select-none hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              <input 
                  type="checkbox" 
                  checked={allSelected} 
                  onChange={handleToggleSelectAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-5 w-5 cursor-pointer"
              />
              <span>Select All ({bookmarks.length})</span>
          </label>
      </div>

      {bookmarks.map((bookmark) => (
        <BookmarkItem 
            key={bookmark.id} 
            bookmark={bookmark} 
            onUpdate={onUpdate} 
            onDelete={onDelete} 
            onRetry={onRetry} 
            isSelected={selectedIds.has(bookmark.id)}
            onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
};

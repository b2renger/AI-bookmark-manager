import React from 'react';
import { Bookmark } from '../types';
import { BookmarkItem } from './BookmarkItem';

interface BookmarkListProps {
  bookmarks: Bookmark[];
  onUpdate: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

export const BookmarkList: React.FC<BookmarkListProps> = ({ bookmarks, onUpdate, onDelete, onRetry }) => {
  if (bookmarks.length === 0) {
    return (
      <div className="text-center py-12 px-6 bg-white dark:bg-slate-800 rounded-xl shadow-lg">
        <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">No bookmarks yet!</h2>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Paste some URLs above to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bookmarks.map((bookmark) => (
        <BookmarkItem key={bookmark.id} bookmark={bookmark} onUpdate={onUpdate} onDelete={onDelete} onRetry={onRetry} />
      ))}
    </div>
  );
};

import React from 'react';
import { Bookmark } from '../types';
import { ExportButton } from './ExportButton';
import { ClearIcon, MoonIcon, SunIcon } from './common/Icons';

interface HeaderProps {
    bookmarks: Bookmark[];
    onClearAll: () => void;
    isDarkMode: boolean;
    onToggleDarkMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({ bookmarks, onClearAll, isDarkMode, onToggleDarkMode }) => {
    const downloadableBookmarks = bookmarks.filter(b => b.status === 'done' || b.status === 'warning');
    
    return (
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
            <div className="container mx-auto p-4 flex justify-between items-center">
                <h1 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500">
                    AI Bookmark Manager
                </h1>
                <div className="flex items-center space-x-2">
                    {bookmarks.length > 0 && (
                         <button
                            onClick={onClearAll}
                            className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"
                            title="Clear all bookmarks"
                        >
                            <ClearIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">Clear All</span>
                        </button>
                    )}
                    <ExportButton bookmarks={downloadableBookmarks} />
                    <button
                        onClick={onToggleDarkMode}
                        className="p-2 text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"
                        aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                        title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                    >
                        {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
                    </button>
                </div>
            </div>
        </header>
    );
};
import React from 'react';
import { Bookmark } from '../types';
import { ExportButton } from './ExportButton';
import { ClearIcon, MoonIcon, SunIcon, CogIcon } from './common/Icons';
import { APP_VERSION, versionDetails } from '../lib/version';

interface HeaderProps {
    bookmarks: Bookmark[];
    onClearAll: () => void;
    isDarkMode: boolean;
    onToggleDarkMode: () => void;
    onOpenSettings: () => void;
    onOpenNotionSync: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
    bookmarks, 
    onClearAll, 
    isDarkMode, 
    onToggleDarkMode, 
    onOpenSettings,
    onOpenNotionSync 
}) => {
    const downloadableBookmarks = bookmarks.filter(b => b.status === 'done' || b.status === 'warning');
    
    return (
        <header className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-sm sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
            <div className="container mx-auto px-4 py-3 flex justify-between items-center gap-3">
                <div className="min-w-0">
                    <h1 className="text-base sm:text-xl md:text-2xl font-bold leading-tight text-slate-900 dark:text-slate-100 truncate">
                        <span className="text-blue-600 dark:text-blue-300">AI</span> Bookmark Manager
                    </h1>
                    <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400" title={versionDetails()}>
                        v{APP_VERSION}
                    </p>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
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
                    <ExportButton bookmarks={downloadableBookmarks} onOpenNotionSync={onOpenNotionSync} />
                    <button
                        onClick={onOpenSettings}
                        className="p-2 text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"
                        aria-label="Settings"
                        title="Settings"
                    >
                        <CogIcon className="h-5 w-5" />
                    </button>
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
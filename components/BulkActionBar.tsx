import React, { useState } from 'react';

interface BulkActionBarProps {
    selectedCount: number;
    onClearSelection: () => void;
    onAddKeyword: (keyword: string) => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({ selectedCount, onClearSelection, onAddKeyword }) => {
    const [keyword, setKeyword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (keyword.trim()) {
            onAddKeyword(keyword.trim());
            setKeyword('');
        }
    }

    return (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-800 text-slate-800 dark:text-white px-4 py-3 md:px-6 md:py-4 rounded-full shadow-2xl z-50 flex items-center gap-4 md:gap-6 animate-fade-in-up border border-slate-200 dark:border-slate-700 w-[95%] md:w-auto max-w-3xl ring-1 ring-slate-900/5">
            <div className="flex items-center gap-3 md:gap-4 flex-shrink-0">
                <div className="flex items-center justify-center bg-blue-600 text-white text-xs font-bold rounded-full h-6 w-6 md:h-7 md:w-7">
                    {selectedCount}
                </div>
                <span className="font-semibold text-sm hidden sm:inline">Selected</span>
                <button 
                    onClick={onClearSelection} 
                    className="text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 text-sm font-medium transition-colors"
                >
                    Clear
                </button>
            </div>
            
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
            
            <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1 min-w-0">
                <input 
                    type="text" 
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="Add keyword to selection..."
                    className="bg-slate-100 dark:bg-slate-900 border-none text-slate-800 dark:text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm w-full md:w-56 placeholder-slate-500 dark:placeholder-slate-400 transition-all"
                />
                <button 
                    type="submit" 
                    disabled={!keyword.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors shadow-sm"
                >
                    Add
                </button>
            </form>
        </div>
    );
}

import React, { useEffect, useState } from 'react';

interface BulkActionBarProps {
    selectedCount: number;
    onClearSelection: () => void;
    /** One tag, or several separated by commas. */
    onAddKeyword: (keyword: string) => void;
    /** Re-reads the selected links and replaces their title, summary and keywords. */
    onRegenerate: () => void;
    /** An import or regeneration is running. */
    busy: boolean;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({ selectedCount, onClearSelection, onAddKeyword, onRegenerate, busy }) => {
    const [keyword, setKeyword] = useState('');
    // Regenerating overwrites edits, so it takes a second tap.
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        if (!confirming) return;
        const timer = setTimeout(() => setConfirming(false), 4000);
        return () => clearTimeout(timer);
    }, [confirming]);

    // A changed selection cancels a pending confirmation.
    useEffect(() => setConfirming(false), [selectedCount]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (keyword.trim()) {
            onAddKeyword(keyword.trim());
            setKeyword('');
        }
    };

    const handleRegenerate = () => {
        if (!confirming) {
            setConfirming(true);
            return;
        }
        setConfirming(false);
        onRegenerate();
    };

    return (
        <div
            className="fixed left-1/2 -translate-x-1/2 z-50 w-[95%] md:w-auto max-w-3xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-4 py-3 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in flex flex-col md:flex-row md:items-center gap-3 md:gap-4"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
            <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex items-center justify-center bg-blue-600 text-white dark:text-slate-900 text-xs font-bold rounded-full h-7 min-w-[1.75rem] px-1.5">
                    {selectedCount}
                </div>
                <span className="font-semibold text-sm">selected</span>
                <button
                    onClick={onClearSelection}
                    className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-300 text-sm font-medium transition-colors"
                >
                    Clear
                </button>
                <button
                    onClick={handleRegenerate}
                    disabled={busy}
                    title="Read the selected links again and replace their title, summary and keywords"
                    className={`ml-auto md:ml-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        confirming
                            ? 'bg-amber-600 hover:bg-amber-700 text-white dark:text-slate-900'
                            : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-100'
                    }`}
                >
                    {busy ? 'Working…' : confirming ? `Replace content of ${selectedCount}?` : 'Regenerate'}
                </button>
            </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden md:block"></div>

            <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1 min-w-0">
                <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="Add tags to selection (comma separated)"
                    aria-label="Tags to add to the selected bookmarks"
                    className="bg-slate-100 dark:bg-slate-900 border border-transparent dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm w-full md:w-64 placeholder-slate-500 dark:placeholder-slate-400"
                />
                <button
                    type="submit"
                    disabled={!keyword.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white dark:text-slate-900 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors shadow-sm"
                >
                    Add
                </button>
            </form>
        </div>
    );
};

import React, { useState, useRef, useEffect } from 'react';
import { Bookmark } from '../types';
import { DownloadIcon } from './common/Icons';

interface ExportButtonProps {
  bookmarks: Bookmark[];
  onOpenNotionSync: () => void;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ bookmarks, onOpenNotionSync }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef]);

  const handleExportHtml = (browserName: string = 'bookmarks') => {
    // Generate a unique timestamp for each bookmark to improve compatibility with browser import
    const bookmarkItems = bookmarks
      .map(bookmark => {
        // Use the bookmark's creation date for the timestamp, fallback to now.
        const timestamp = bookmark.createdAt 
            ? Math.floor(new Date(bookmark.createdAt).getTime() / 1000) 
            : Math.floor(Date.now() / 1000);
        const description = `${bookmark.summary}${bookmark.keywords.length > 0 ? ` (Keywords: ${bookmark.keywords.join(', ')})` : ''}`;
        return `
    <DT><A HREF="${bookmark.url}" ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">${escapeHtml(bookmark.title)}</A>
    <DD>${escapeHtml(description)}`;
      })
      .join('\n');

    const htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    ${bookmarkItems}
</DL><p>
`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${browserName}_bookmarks.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false); // Close dropdown after export
  };

  const escapeHtml = (text: string): string => {
    return text
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  const escapeCsvField = (field: string | string[]): string => {
    let fieldStr = Array.isArray(field) ? field.join(', ') : String(field);
    // If the field contains a comma, double quote, or newline, wrap it in double quotes.
    if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
        // Inside the quoted string, any existing double quotes must be escaped by doubling them.
        fieldStr = fieldStr.replace(/"/g, '""');
        return `"${fieldStr}"`;
    }
    return fieldStr;
  };

  const handleExportCsv = () => {
    const headers = ['url', 'title', 'summary', 'keywords', 'createdAt'];
    const rows = bookmarks.map(b => 
      [
        escapeCsvField(b.url),
        escapeCsvField(b.title),
        escapeCsvField(b.summary),
        escapeCsvField(b.keywords),
        escapeCsvField(b.createdAt)
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai_bookmarks.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };
  
  const handleExportJson = () => {
    const jsonContent = JSON.stringify(bookmarks, null, 2); // Pretty-print with 2-space indentation
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai_bookmarks.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };
  
  const handleExportMarkdown = () => {
    const markdownRows = bookmarks.map(b => {
      const date = b.createdAt ? `*Published: ${new Date(b.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}*\n\n` : '';
      const summary = `**Summary:** ${b.summary}\n\n`;
      const keywords = b.keywords.length > 0 ? `**Keywords:** ${b.keywords.map(k => `\`${k}\``).join(', ')}` : '';
      return `## [${b.title}](${b.url})\n${date}${summary}${keywords}`;
    });

    const markdownContent = `# AI Bookmarks\n\n${markdownRows.join('\n\n---\n\n')}`;

    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai_bookmarks.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  const handleExportHtmlFile = () => {
    const bookmarkItemsHtml = bookmarks.map(b => {
      const date = b.createdAt ? `<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">Published: ${new Date(b.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>` : '';
      const keywordsHtml = b.keywords.length > 0 
        ? `<div class="mt-4">
             <h4 class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Keywords</h4>
             <div class="mt-1 flex flex-wrap items-center gap-2">
               ${b.keywords.map(k => `<span class="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 text-sm font-medium px-2 py-1 rounded-full">${escapeHtml(k)}</span>`).join('')}
             </div>
           </div>` 
        : '';

      return `
        <article class="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-md mb-4">
          <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">
            <a href="${b.url}" target="_blank" rel="noopener noreferrer" class="hover:underline">${escapeHtml(b.title)}</a>
          </h3>
          <a href="${b.url}" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-500 dark:text-blue-400 hover:underline break-all">${b.url}</a>
          ${date}
          <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div>
              <h4 class="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Summary</h4>
              <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">${escapeHtml(b.summary)}</p>
            </div>
            ${keywordsHtml}
          </div>
        </article>
      `;
    }).join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Bookmarks Export</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = { darkMode: 'class' }
  </script>
</head>
<body class="bg-slate-50 dark:bg-slate-900 transition-colors duration-300 font-sans">
  <main class="container mx-auto p-4 md:p-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500 mb-8">
        AI Bookmarks Export
      </h1>
      ${bookmarkItemsHtml}
    </div>
  </main>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai_bookmarks_export.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };


  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={bookmarks.length === 0}
        className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
        title="Export options"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <DownloadIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Export / Sync</span>
        <svg className={`-mr-1 h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-slate-700 ring-1 ring-black ring-opacity-5 focus:outline-none z-20"
          role="menu" 
          aria-orientation="vertical" 
          aria-labelledby="export-menu-button"
        >
          <div className="py-1" role="none">
            {/* Notion Integration Option */}
             <button
              onClick={() => {
                  setIsOpen(false);
                  onOpenNotionSync();
              }}
              className="flex items-center w-full text-left px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-600 border-b border-slate-200 dark:border-slate-600"
              role="menuitem"
            >
              <span className="mr-2">N</span> Sync to Notion
            </button>

            <button
              onClick={handleExportJson}
              className="block w-full text-left px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
              role="menuitem"
            >
              As JSON file
            </button>
            <button
              onClick={handleExportCsv}
              className="block w-full text-left px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
              role="menuitem"
            >
              As CSV file
            </button>
             <button
              onClick={handleExportMarkdown}
              className="block w-full text-left px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
              role="menuitem"
            >
              As Markdown file
            </button>
            <button
              onClick={handleExportHtmlFile}
              className="block w-full text-left px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
              role="menuitem"
            >
              As HTML file
            </button>
            <div className="border-t border-slate-200 dark:border-slate-600 my-1" role="separator"></div>
            <p className="px-4 pt-2 pb-1 text-xs text-slate-500 dark:text-slate-400">For Browser Import:</p>
            <button
              onClick={() => handleExportHtml('chrome')}
              className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
              role="menuitem"
            >
              For Chrome
            </button>
            <button
              onClick={() => handleExportHtml('firefox')}
              className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
              role="menuitem"
            >
              For Firefox
            </button>
            <button
              onClick={() => handleExportHtml('edge')}
              className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
              role="menuitem"
            >
              For Edge
            </button>
            <button
              onClick={() => handleExportHtml('safari')}
              className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
              role="menuitem"
            >
              For Safari
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
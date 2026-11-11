import React, { useEffect, useState } from 'react';
import { applyPendingUpdate, promptInstall, subscribeToPwa, type PwaState } from '../lib/pwa';

/**
 * The install offer, the update offer and the offline notice, as one small
 * stack at the top of the page. Ported from Strudel-companion.
 */

const DISMISS_KEY = 'ai-bookmark-manager-install-dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* nothing to remember it with */
  }
}

const pill = 'pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-md';
const action = 'rounded-lg px-3 py-1.5 font-semibold text-white transition-colors';

export const PwaControls: React.FC<{ busy?: boolean }> = ({ busy }) => {
  const [pwa, setPwa] = useState<PwaState | null>(null);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => subscribeToPwa(setPwa), []);

  if (!pwa) return null;

  const showUpdate = pwa.updateReady;
  const showOffline = !pwa.online;
  const showInstall = !dismissed && (pwa.installRoute === 'prompt' || pwa.installRoute === 'ios-manual');

  if (!showUpdate && !showOffline && !showInstall && !showIosHelp) return null;

  const dismissInstall = () => {
    setDismissed(true);
    setShowIosHelp(false);
    rememberDismissal();
  };

  const handleInstall = async () => {
    if (pwa.installRoute === 'ios-manual') {
      setShowIosHelp(true);
      return;
    }
    const outcome = await promptInstall();
    // Do not nag: the browser's own menu entry remains.
    if (outcome === 'dismissed') dismissInstall();
  };

  return (
    <div
      className="fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-3 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      {showOffline && (
        <div role="status" className={`${pill} border-amber-300 bg-amber-50 text-amber-900`}>
          Offline. Your bookmarks are available; cloud models need a connection.
        </div>
      )}

      {showUpdate && (
        <div role="status" className={`${pill} border-emerald-300 bg-emerald-50 text-emerald-900`}>
          <span>A new version is ready.</span>
          <button
            onClick={() => void applyPendingUpdate()}
            disabled={busy}
            className={`${action} bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50`}
          >
            Reload
          </button>
          {busy && <span>Available when the current import finishes.</span>}
        </div>
      )}

      {showInstall && !showUpdate && !showIosHelp && (
        <div className={`${pill} border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100`}>
          <span>Install this app on your device</span>
          <button onClick={handleInstall} className={`${action} bg-blue-600 hover:bg-blue-700`}>
            {pwa.installRoute === 'ios-manual' ? 'How' : 'Install'}
          </button>
          <button
            onClick={dismissInstall}
            aria-label="Dismiss the install offer"
            className="rounded-lg px-2 py-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            ✕
          </button>
        </div>
      )}

      {showIosHelp && (
        // Safari exposes no install API, so the manual route is the only honest offer.
        <div
          role="dialog"
          aria-label="Add to Home Screen"
          className="pointer-events-auto w-full max-w-sm rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-800 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Add to Home Screen</span>
            <button onClick={() => setShowIosHelp(false)} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
              ✕
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Tap the Share button in Safari's toolbar.</li>
            <li>Choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap Add.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">This only works in Safari on iPhone and iPad.</p>
        </div>
      )}
    </div>
  );
};

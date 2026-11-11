/**
 * Keeping an import going, and keeping the user informed, when the app is not
 * in front.
 *
 * What a web page can and cannot do here:
 *  - A hidden page keeps running for a while, with slower timers (lib/timers.ts
 *    works around that).
 *  - On Android, Chrome freezes a page that has been in the background for
 *    about five minutes. Its heuristics spare a page whose service worker is
 *    running, so while an import is in progress the page pings the service
 *    worker to keep it awake. This is best effort: the browser decides.
 *  - If the page is frozen or closed anyway, the unfinished links are kept and
 *    the import continues by itself the next time the app is opened (App.tsx).
 *  - Notifications tell the user when a background import finished or paused.
 *
 * Moving the import itself into the service worker (Background Sync) was
 * considered and rejected: the browser limits how long such an event may run,
 * ends a service worker whose request takes too long to answer, and the page
 * reading code needs a document. It would make imports less reliable, not more.
 */

const NOTIFY_KEY = 'ai-bookmark-manager-notify';
const NOTIFICATION_TAG = 'import-status';
const KEEPALIVE_INTERVAL_MS = 20_000;

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotifyState = 'on' | 'off' | 'blocked' | 'unsupported';

function wantsNotifications(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === 'on';
  } catch {
    return false;
  }
}

export function notifyState(): NotifyState {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return wantsNotifications() && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Turns notifications on (asking the browser for permission) or off. Call from a tap. */
export async function setNotifications(enabled: boolean): Promise<NotifyState> {
  try {
    if (!enabled) {
      localStorage.setItem(NOTIFY_KEY, 'off');
      return notifyState();
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    localStorage.setItem(NOTIFY_KEY, permission === 'granted' ? 'on' : 'off');
  } catch {
    /* storage or permission prompt unavailable */
  }
  return notifyState();
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    // Not `.ready`: that never settles when no service worker is installed.
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

async function show(title: string, body: string): Promise<void> {
  if (notifyState() !== 'on') return;
  const reg = await registration();
  if (!reg) return;
  try {
    // Android only allows notifications shown through the service worker.
    await reg.showNotification(title, {
      body,
      tag: NOTIFICATION_TAG,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
    });
  } catch {
    /* permission withdrawn, or not supported here */
  }
}

async function clearNotification(): Promise<void> {
  const reg = await registration();
  if (!reg) return;
  try {
    (await reg.getNotifications({ tag: NOTIFICATION_TAG })).forEach((n) => n.close());
  } catch {
    /* nothing to clear */
  }
}

// ---------------------------------------------------------------------------
// Import session
// ---------------------------------------------------------------------------

export interface ImportProgress {
  total: number;
  done: number;
  failed: number;
}

let active: (() => ImportProgress) | null = null;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let listenersInstalled = false;

function pingServiceWorker() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'keepalive' });
  } catch {
    /* no controller yet */
  }
}

function installListeners() {
  if (listenersInstalled || typeof document === 'undefined') return;
  listenersInstalled = true;

  // Fired by Chrome just before it freezes the page: the last moment to tell
  // the user that the import has stopped moving.
  document.addEventListener('freeze', () => {
    if (!active) return;
    const p = active();
    const left = p.total - p.done - p.failed;
    if (left > 0) void show('Import paused', `${left} link${left === 1 ? '' : 's'} left. Open the app to continue.`);
  });

  const onReturn = () => {
    if (document.visibilityState === 'visible') void clearNotification();
  };
  document.addEventListener('visibilitychange', onReturn);
  document.addEventListener('resume', onReturn);
}

/** Call when an import or regeneration starts. `progress` is read when needed. */
export function beginImportSession(progress: () => ImportProgress): void {
  installListeners();
  active = progress;
  pingServiceWorker();
  if (keepAliveTimer === null) keepAliveTimer = setInterval(pingServiceWorker, KEEPALIVE_INTERVAL_MS);
}

/** Call when it ends. Notifies only if the user is not looking at the app. */
export function endImportSession(): void {
  const progress = active ? active() : null;
  active = null;
  if (keepAliveTimer !== null) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  if (!progress || typeof document === 'undefined' || document.visibilityState !== 'hidden') return;
  const body = progress.failed > 0
    ? `${progress.done} summarised, ${progress.failed} need${progress.failed === 1 ? 's' : ''} your attention.`
    : `${progress.done} link${progress.done === 1 ? '' : 's'} summarised.`;
  void show('Import finished', body);
}

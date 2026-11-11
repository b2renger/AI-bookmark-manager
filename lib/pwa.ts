/**
 * Progressive Web App lifecycle: installation and updates.
 * Ported from Strudel-companion.
 *
 * - Updates are offered, never applied mid-session: a new service worker
 *   taking over an open page would strand its lazily loaded chunks (the
 *   on-device model code) and could interrupt a batch of links.
 * - Installation differs per browser. Chromium fires `beforeinstallprompt`,
 *   which must be captured and replayed inside a user gesture. iOS Safari has
 *   no API at all: the only route is Share > Add to Home Screen.
 * - Both answers change at runtime, so consumers subscribe.
 */

import { registerSW } from 'virtual:pwa-register';

/** The Chromium-only event. Not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallRoute =
  /** Chromium captured a prompt; `promptInstall()` will work. */
  | 'prompt'
  /** iOS/iPadOS Safari: no API, show the Share-sheet instructions. */
  | 'ios-manual'
  /** Already running as an installed app. */
  | 'installed'
  /** No route we can offer (Firefox, or the browser has not offered yet). */
  | 'unavailable';

export interface PwaState {
  installRoute: InstallRoute;
  /** A new version is downloaded and waiting for the user to accept it. */
  updateReady: boolean;
  online: boolean;
}

type Listener = (state: PwaState) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

const state: PwaState = {
  installRoute: 'unavailable',
  updateReady: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};

const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener({ ...state });
}

export function subscribeToPwa(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
}

/** True when the page is running as an installed app rather than in a tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const byDisplayMode = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
  );
  // iOS Safari uses the legacy `navigator.standalone` instead.
  return byDisplayMode || (navigator as any).standalone === true;
}

/** iOS and iPadOS, including iPadOS pretending to be a Mac. */
function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  return /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function recomputeInstallRoute() {
  const previous = state.installRoute;
  if (isStandalone()) state.installRoute = 'installed';
  else if (deferredPrompt) state.installRoute = 'prompt';
  else if (isIOS()) state.installRoute = 'ios-manual';
  else state.installRoute = 'unavailable';
  if (state.installRoute !== previous) emit();
}

/** Shows the browser's install dialog. Chromium only, inside a user gesture. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  // Single-use by spec: holding a stale one leaves a button that does nothing.
  deferredPrompt = null;
  try {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    recomputeInstallRoute();
    return outcome;
  } catch {
    recomputeInstallRoute();
    return 'unavailable';
  }
}

/** Activates the waiting service worker and reloads onto the new version. */
export async function applyPendingUpdate(): Promise<void> {
  if (applyUpdate) await applyUpdate(true);
}

/** Wires up the service worker and install listeners. Call once, before React renders. */
export function initPwa(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep Chromium's own mini-infobar away; the offer is shown by PwaControls.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    recomputeInstallRoute();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    recomputeInstallRoute();
  });

  const setOnline = (online: boolean) => {
    if (state.online === online) return;
    state.online = online;
    emit();
  };
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', recomputeInstallRoute);

  try {
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() {
        state.updateReady = true;
        emit();
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        // A long-lived installed app would otherwise sit on an old build.
        const check = () => {
          if (navigator.onLine) void registration.update();
        };
        setInterval(check, 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      },
    });
  } catch {
    /* no service worker support: the app still works as a normal page */
  }

  recomputeInstallRoute();
}

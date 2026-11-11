/**
 * Build identity, injected by vite.config.ts.
 *
 * The last number is the deployment counter: the GitHub Actions run number,
 * so it goes up by one on every deployment without anyone editing a file.
 */
declare const __APP_VERSION__: string | undefined;
declare const __BUILD_DATE__: string | undefined;
declare const __BUILD_COMMIT__: string | undefined;

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : 'dev';
export const BUILD_DATE: string = typeof __BUILD_DATE__ !== 'undefined' && __BUILD_DATE__ ? __BUILD_DATE__ : '';
export const BUILD_COMMIT: string = typeof __BUILD_COMMIT__ !== 'undefined' && __BUILD_COMMIT__ ? __BUILD_COMMIT__ : '';

/** For example "v1.0.6 · 11 Nov 2026 · 5b3933f". */
export function versionDetails(): string {
  const parts = [`v${APP_VERSION}`];
  if (BUILD_DATE) {
    const d = new Date(BUILD_DATE);
    if (!isNaN(d.getTime())) {
      parts.push(d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    }
  }
  if (BUILD_COMMIT) parts.push(BUILD_COMMIT.slice(0, 7));
  return parts.join(' · ');
}

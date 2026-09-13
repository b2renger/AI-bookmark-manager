import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userData: string;
  rendererErrors: string[];
  close(): Promise<void>;
}

/**
 * Launches the built app with a FRESH userData directory (this is how the rig "cold" case is
 * exercised) and collects renderer console errors. `CAIRN_FIXTURE` may point at a seeded DB.
 */
export async function launchApp(opts: { fixture?: string } = {}): Promise<LaunchedApp> {
  const userData = mkdtempSync(join(tmpdir(), 'cairn-e2e-'));
  // VS Code terminals export ELECTRON_RUN_AS_NODE=1, which would start Electron as plain Node.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  env['CAIRN_USER_DATA'] = userData;
  if (opts.fixture) env['CAIRN_FIXTURE'] = opts.fixture;

  const app = await electron.launch({ args: [join(__dirname, '..', 'out', 'main', 'index.js')], env });
  const page = await app.firstWindow();
  const rendererErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') rendererErrors.push(msg.text());
  });
  page.on('pageerror', (err) => rendererErrors.push(String(err)));
  await page.waitForLoadState('domcontentloaded');
  return {
    app,
    page,
    userData,
    rendererErrors,
    close: async () => {
      await app.close();
      try {
        rmSync(userData, { recursive: true, force: true });
      } catch {
        /* Windows may hold the WAL briefly; the temp dir is disposable */
      }
    },
  };
}

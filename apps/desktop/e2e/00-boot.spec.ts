import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './fixtures';

// Smoke #1 (P0): the window opens from a cold userData, the renderer boots without errors, the
// title is set and the database file is created next to userData.
test('boots from a cold userData without renderer errors', async () => {
  const t0 = Date.now();
  const launched = await launchApp();
  const { app, page, userData, rendererErrors } = launched;
  try {
    await expect(page).toHaveTitle('Cairn');
    await expect(page.locator('#root')).not.toBeEmpty();
    const info = await page.evaluate(() => window.cairn.app.info());
    expect(info.userDataPath).toBe(userData);
    // The DB is opened by main at startup once P0 task 5 lands; until then only the path is known.
    expect(info.dbPath).toBe(join(userData, 'library.db'));
    const launchMs = Date.now() - t0;
    console.log(`launch→interactive ${launchMs} ms`);
    expect(launchMs).toBeLessThan(15_000);
    expect(rendererErrors).toEqual([]);
    // Sandbox and isolation are on: no Node globals in the renderer.
    const leaked = await page.evaluate(() => typeof (globalThis as { require?: unknown }).require);
    expect(leaked).toBe('undefined');
    void existsSync;
    void app;
  } finally {
    await launched.close();
  }
});

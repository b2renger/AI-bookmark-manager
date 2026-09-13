import { defineConfig } from '@playwright/test';

// Playwright drives the BUILT app (out/main/index.js) through _electron.launch. Run
// `npm -w @cairn/desktop run build` first. One spec is added per phase (plans/TECHNICAL-DESIGN.md §8.4).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]],
  outputDir: '../../test-results',
});

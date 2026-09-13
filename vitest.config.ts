import { defineConfig } from 'vitest/config';

// Four projects (plans/TECHNICAL-DESIGN.md §8.1). `scale` is never part of the default run: it
// needs the generated 100k fixture and a 15-minute budget.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: 'packages/core',
          environment: 'node',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: ['test/scale/**'],
          setupFiles: ['test/setup.ts'],
        },
      },
      {
        test: {
          name: 'ui',
          root: 'packages/ui',
          environment: 'happy-dom',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'main',
          root: 'apps/desktop',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'scale',
          root: 'packages/core',
          environment: 'node',
          include: ['test/scale/**/*.test.ts'],
          testTimeout: 900_000,
          maxWorkers: 1,
        },
      },
    ],
  },
});

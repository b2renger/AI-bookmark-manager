import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Workspace packages are aliased to their sources and BUNDLED into each target (no separate build
// step, same pattern as artlux). Native modules stay external in main (externalizeDepsPlugin).
const workspaceAliases = [
  { find: '@cairn/core', replacement: resolve(__dirname, '../../packages/core/src/index.ts') },
  { find: '@cairn/ui', replacement: resolve(__dirname, '../../packages/ui/src/index.ts') },
];

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
    plugins: [externalizeDepsPlugin({ exclude: ['@cairn/core'] })],
    resolve: { alias: workspaceAliases },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [{ find: '@', replacement: resolve(__dirname, 'src/renderer') }, ...workspaceAliases],
    },
    server: { port: 5173 },
  },
});

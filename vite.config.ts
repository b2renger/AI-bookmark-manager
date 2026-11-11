import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Static build, deployable to GitHub Pages.
 *
 * No API key is read here: keys are entered by the user in Settings and stay
 * in their browser. Anything defined at build time would be published with
 * the bundle.
 *
 * `base` is './' so the same build works under https://<user>.github.io/<repo>/,
 * on a custom domain, or from `vite preview`, with no configuration.
 */
export default defineConfig({
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // The WebGPU worker is an ES module (`new Worker(url, { type: 'module' })`).
  worker: {
    format: 'es',
  },
  build: {
    // WebGPU itself needs a recent browser, so there is no point in a lower target.
    target: 'es2022',
    // The web-llm chunk is large but only loaded by the worker, on demand.
    chunkSizeWarningLimit: 7000,
  },
});

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Static build, deployable to GitHub Pages and installable as a PWA.
 *
 * No API key is read here: keys are entered by the user in Settings and stay
 * in their browser. Anything defined at build time would be published with
 * the bundle.
 *
 * `base` is './' so the same build works under https://<user>.github.io/<repo>/,
 * on a custom domain, or from `vite preview`, with no configuration. Every
 * manifest URL below is relative for the same reason.
 */
export default defineConfig({
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new version waits until the user accepts it (see lib/pwa.ts).
      registerType: 'prompt',
      // Registration is done in lib/pwa.ts so update callbacks have somewhere to go.
      injectRegister: null,
      includeAssets: ['favicon-32.png', 'apple-touch-icon-180.png'],
      manifest: {
        name: 'AI Bookmark Manager',
        short_name: 'Bookmarks AI',
        description: 'Paste links and get reliable summaries and keywords, with your own AI keys.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        // Relative: resolved against the manifest URL, which sits under the
        // project path on GitHub Pages. `id` is left to default to start_url,
        // which keeps it unique per deployment.
        start_url: './',
        scope: './',
        lang: 'en',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        // Keep the multi-megabyte on-device model worker out of the precache:
        // only people who choose that option should download it.
        globIgnores: ['**/webllmWorker-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // The on-device model worker, cached the first time it is used.
            urlPattern: /\/assets\/webllmWorker-[\w-]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'webllm-worker',
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Styling is loaded from the Tailwind CDN; keep a copy for offline starts.
            urlPattern: /^https:\/\/cdn\.tailwindcss\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tailwind-cdn',
              expiration: { maxEntries: 4 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // No rule for model weights: web-llm keeps them in its own cache.
        ],
      },
    }),
  ],
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

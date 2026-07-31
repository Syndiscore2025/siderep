import { fileURLToPath, URL } from 'node:url';

import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import manifest from './manifest.config.ts';

// The extension is bundled by Vite + @crxjs/vite-plugin. crxjs takes the
// typed manifest, wires up every entry point (side panel HTML, background
// service worker, content script) and emits an MV3-compliant build in `dist/`.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: {
    target: 'esnext',
    sourcemap: true,
    // Keep chunk names stable and readable for a reviewable extension bundle.
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/chunk-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

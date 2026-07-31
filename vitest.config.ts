import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// A dedicated Vitest config (without the crxjs plugin) so unit tests run in a
// plain jsdom environment and never attempt to build the extension manifest.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
  },
});

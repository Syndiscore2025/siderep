import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Vite injects dev-mode styles inline without the CSP nonce, so allow
// 'unsafe-inline' for style-src during `vite serve` only. Production builds
// keep the strict nonce-based policy from web/index.html.
function devStyleCsp(): Plugin {
  return {
    name: 'siderep:dev-style-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        "style-src 'self' 'nonce-siderep-web-csp'",
        "style-src 'self' 'unsafe-inline'",
      );
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '/src': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [react(), tailwindcss(), devStyleCsp()],
  appType: 'spa',
  html: {
    cspNonce: 'siderep-web-csp',
  },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
});

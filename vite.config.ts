// Spec: 08-0 §E.4 (base './', app://foo/ in production, localhost:5173 only with FOO_DEV=1), 08-1 §1.2.1 (inputs: index.html,
// windows/live.html, windows/signin-banner.html; viewer and pdfraster arrive with their milestones).
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  publicDir: 'public',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    target: 'chrome140',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html'),
        live: resolve(__dirname, 'src/renderer/windows/live.html'),
        'signin-banner': resolve(__dirname, 'src/renderer/windows/signin-banner.html'),
      },
    },
  },
});

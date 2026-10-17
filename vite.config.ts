// Spec: 08-0 §E.4 (base './', app://foo/ in production, localhost:5173 only with FOO_DEV=1).
import react from '@vitejs/plugin-react';
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
  },
});

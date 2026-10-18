// Spec: 08-0 §E.4 (base './', app://foo/ in production, localhost:5173 only with FOO_DEV=1); CR-0018 G-M14-24
// (`__FOO_TESTER_BUILD__`: true unless the release workflow signed the build and set FOO_SIGNED_BUILD=1).
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  publicDir: 'public',
  plugins: [react()],
  define: { __FOO_TESTER_BUILD__: JSON.stringify(process.env.FOO_SIGNED_BUILD !== '1') },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    target: 'chrome140',
  },
});

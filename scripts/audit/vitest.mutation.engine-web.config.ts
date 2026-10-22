// Spec: 08-3 §22.8. Focused engine web boundary mutation slice; target union is checked by mutation-preflight.ts.
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { mutationFilesForSlice } from './mutation-manifest';

export default defineConfig({
  test: {
    root: path.resolve(__dirname, '../..'),
    include: [...mutationFilesForSlice('engine-web')],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});

import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { mutationFilesFor } from './mutation-manifest';

export default defineConfig({
  test: {
    root: path.resolve(__dirname, '../..'),
    include: [...mutationFilesFor('main')],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});

// Spec: 07 journeys and 08-2 §5 (the lane's executable eval adapter runs as an isolated Vitest project).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/eval/**/*.test.ts'],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});

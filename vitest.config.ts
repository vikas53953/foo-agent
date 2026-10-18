import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/unit/**/*.test.ts',
      'test/integration/**/*.test.ts',
      'test/perf/**/*.test.ts',
      'test/articles/**/*.test.ts',
      'test/fidelity/**/*.test.ts',
    ],
    environment: 'node',
  },
});

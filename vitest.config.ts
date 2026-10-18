import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/articles/**/*.test.ts', 'test/fidelity/**/*.test.ts', 'test/integration/**/*.test.ts'],
    environment: 'node',
  },
});

// Spec: 10-2 §E.1–§E.2; execute the soak fixture and observer regression tests explicitly.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/soak/**/*.test.ts'],
    environment: 'node',
  },
});

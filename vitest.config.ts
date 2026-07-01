import { defineConfig } from 'vitest/config';

// Sprint 0: fast, deterministic unit tests for pure domain logic (Node env).
// Sprint 1 adds @cloudflare/vitest-pool-workers for integration tests that run
// inside the real workerd runtime against a local D1 database.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});

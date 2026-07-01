import { fileURLToPath } from 'node:url';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// All tests run inside the real workerd runtime. Pure domain tests don't touch
// bindings; integration tests exercise the tool router + services against a real
// local D1, seeded from migrations/ (ADR-0007: testing throughout).
export default defineWorkersConfig(async () => {
  const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url));
  const migrations = await readD1Migrations(migrationsDir);

  return {
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            // TEST_MIGRATIONS is consumed by the setup file; WEBHOOK_HMAC_SECRET
            // activates the webhook route; ENVIRONMENT=test makes the rate-limit
            // middleware skip the Durable Object (its window logic is unit-tested
            // directly, since DOs break the pinned pool's storage isolation).
            bindings: {
              TEST_MIGRATIONS: migrations,
              WEBHOOK_HMAC_SECRET: 'test-secret',
              ENVIRONMENT: 'test',
            },
          },
        },
      },
    },
  };
});

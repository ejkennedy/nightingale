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
            // TEST_MIGRATIONS is consumed by the setup file; the webhook secret
            // activates the HMAC-verified webhook route in integration tests.
            bindings: { TEST_MIGRATIONS: migrations, WEBHOOK_HMAC_SECRET: 'test-secret' },
          },
        },
      },
    },
  };
});

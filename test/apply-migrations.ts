import { applyD1Migrations, env } from 'cloudflare:test';

// Apply the D1 schema into each test worker's (isolated) storage before its
// tests run. Per-test writes then roll back automatically, so every test starts
// from a clean, migrated database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

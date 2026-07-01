import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';
import type { Env } from '../src/env';

// Type the bindings available to tests via `import { env } from 'cloudflare:test'`.
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}

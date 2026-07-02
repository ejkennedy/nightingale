/**
 * One-command Cloudflare bootstrap for a live deploy. Idempotent.
 *
 *   wrangler login            # or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 *   bun run cf:bootstrap      # add --seed to also load demo data remotely
 *
 * It: creates the D1 database (if absent) and writes its id into wrangler.toml,
 * creates the R2 prompts bucket, and applies remote migrations. After this,
 * `bun run deploy` (or the gated GitHub CD) ships the Worker. See docs/DEPLOY.md.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DB_NAME = 'nightingale';
const R2_BUCKET = 'nightingale-prompts';
const seed = process.argv.includes('--seed');

function run(args: string[], opts: { allowFail?: boolean } = {}): string {
  console.log(`\n$ wrangler ${args.join(' ')}`);
  const r = spawnSync('wrangler', args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(out);
  if (r.status !== 0 && !opts.allowFail) {
    console.error(`\n✗ wrangler ${args[0]} failed. Are you logged in (\`wrangler login\`)?`);
    process.exit(1);
  }
  return out;
}

/** Find the D1 database id by name, or create it. */
function ensureDatabaseId(): string {
  const listed = run(['d1', 'list', '--json'], { allowFail: true });
  const fromList = findId(listed);
  if (fromList) {
    console.log(`✓ D1 "${DB_NAME}" exists: ${fromList}`);
    return fromList;
  }
  const created = run(['d1', 'create', DB_NAME]);
  const id = findId(created) ?? findId(run(['d1', 'list', '--json'], { allowFail: true }));
  if (!id) {
    console.error('✗ Could not determine the new database id; check the output above.');
    process.exit(1);
  }
  console.log(`✓ Created D1 "${DB_NAME}": ${id}`);
  return id;
}

/** Pull a uuid for DB_NAME out of either JSON (`d1 list --json`) or TOML-ish text. */
function findId(text: string): string | null {
  try {
    const arr = JSON.parse(text) as Array<{ uuid?: string; name?: string }>;
    const hit = arr.find((d) => d.name === DB_NAME);
    if (hit?.uuid) return hit.uuid;
  } catch {
    /* not JSON — fall through */
  }
  const m =
    text.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i) ??
    text.match(/([0-9a-f]{8}-[0-9a-f-]{27})/i);
  return m ? m[1] : null;
}

function patchWranglerToml(id: string): void {
  const path = fileURLToPath(new URL('../wrangler.toml', import.meta.url));
  const toml = readFileSync(path, 'utf8');
  const patched = toml.replace(/database_id = "[0-9a-f-]+"(\s*#.*)?/i, `database_id = "${id}"`);
  if (patched === toml) {
    console.log('• wrangler.toml already points at this id (or no placeholder found).');
    return;
  }
  writeFileSync(path, patched);
  console.log('✓ Wrote database_id into wrangler.toml');
}

const id = ensureDatabaseId();
patchWranglerToml(id);
run(['r2', 'bucket', 'create', R2_BUCKET], { allowFail: true }); // no-op if it exists
run(['d1', 'migrations', 'apply', DB_NAME, '--remote']);
if (seed) run(['d1', 'execute', DB_NAME, '--remote', '--file=./src/db/seed.sql']);

console.log(`
✓ Bootstrap complete.

Next:
  1. Set runtime secrets (only the tiers you want):
       wrangler secret put OPENAI_API_KEY
       wrangler secret put WEBHOOK_TOKEN        # for Tier-1 voice tool calls
       wrangler secret put ELEVENLABS_API_KEY   # optional: signed URLs
       wrangler secret put ELEVENLABS_AGENT_ID  # from \`bun run voice:provision\`
       wrangler secret put ADMIN_TOKEN
  2. Ship it:   bun run deploy
     ...or enable GitHub CD: set repo secrets CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
     and repo variable DEPLOY_ENABLED=true (deploy.yml does the rest on push to main).
`);

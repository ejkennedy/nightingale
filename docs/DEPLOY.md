# Deploying Nightingale to Cloudflare

The Worker serves both the orchestration API and the dashboard from **one URL**.
Everything below is idempotent; nothing here commits a secret.

## One-time bootstrap

```bash
wrangler login                 # or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
bun run cf:bootstrap           # add --seed to also load demo data remotely
```

`cf:bootstrap` (see [scripts/cf-bootstrap.ts](../scripts/cf-bootstrap.ts)):

1. creates the **D1** database `nightingale` (if absent) and writes its
   `database_id` into `wrangler.toml`,
2. creates the **R2** bucket `nightingale-prompts`,
3. applies **remote migrations**,
4. (with `--seed`) loads the synthetic demo data.

## Secrets (set only the tiers you want)

```bash
wrangler secret put ADMIN_TOKEN          # gate the re-seed / admin actions
wrangler secret put OPENAI_API_KEY       # Tier 2: GPT brain + text chat
wrangler secret put WEBHOOK_TOKEN        # Tier 1: authenticate agent tool calls
wrangler secret put ELEVENLABS_AGENT_ID  # Tier 1: which agent the widget embeds
wrangler secret put ELEVENLABS_API_KEY   # Tier 1: signed URLs for a private agent
wrangler secret put RESEND_API_KEY       # real confirmation emails
wrangler secret put RESEND_FROM
```

With **none** set, the deployed Worker still runs Tier 3 (scripted calls + real
D1 writes + email preview) — the link never dies.

## Ship it

```bash
bun run deploy                 # wrangler deploy
```

Then, for voice, create the agent pointed at the now-public URL —
see [VOICE_SETUP.md](./VOICE_SETUP.md).

## Continuous deployment (GitHub Actions)

CD is wired but **dormant** ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml))
so the Actions tab stays green until you opt in. To enable auto-deploy on push to
`main`:

1. Create a scoped Cloudflare API token — **Workers Scripts: Edit**, **D1: Edit**,
   **Workers R2 Storage: Edit**.
2. Repo → **Settings → Secrets and variables → Actions**:
   - secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - variable: `DEPLOY_ENABLED = true`
3. Set the runtime secrets on the Worker (the list above) once via `wrangler`.

On the next push the workflow typechecks, runs the full test suite, applies remote
migrations and deploys. It is guarded by `if: vars.DEPLOY_ENABLED == 'true'`, so
forks and the pre-opt-in state simply skip it.

## Verify

```bash
curl https://nightingale.<your-subdomain>.workers.dev/health
# → { "status": "ok", "tier": "voice" | "gpt" | "scripted", ... }
```

The `tier` reflects which secrets resolved — a quick post-deploy sanity check.

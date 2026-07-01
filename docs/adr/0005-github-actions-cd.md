# 5. Deploy via GitHub Actions with a scoped API token

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

The promised deliverable is a single live Workers URL. However, the local cached
Wrangler OAuth token **cannot deploy Workers** (it returns 403 on `workers/*`);
only D1 CLI operations work with the account id set. We need a reliable,
repeatable path to a live deployment that doesn't depend on that broken token.

## Decision

Deploy through **GitHub Actions** using a **scoped Cloudflare API token**
(`Workers Scripts:Edit` + `D1:Edit`) stored as a repo secret. Pushing to `main`
runs migrations against remote D1 and deploys the Worker. The deploy job is
guarded by a `DEPLOY_ENABLED` repo variable so it stays dormant (Actions tab
green) until the token, account id and D1 database are provisioned.

Local development uses `wrangler dev` against local D1 — no login required.

## Consequences

- Sidesteps the broken cached token entirely; deploys use a purpose-scoped token.
- Yields a genuine CD pipeline — a portfolio asset in itself.
- Requires a one-time setup (create token + D1, set secrets + `DEPLOY_ENABLED`),
  documented in `.github/workflows/deploy.yml` and the README.

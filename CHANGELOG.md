# Changelog

All notable changes to Nightingale are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Sprint 1 — Data model &amp; core tool router (in progress)

- D1 schema (practitioners, patients, slots, appointments, call_logs, events)
  with a partial unique index enforcing one live appointment per slot.
- Pure, unit-tested domain core: identity matching (the name+DOB guardrail),
  PII redaction at the boundary, timezone-aware scheduling helpers.
- Data-access layer with atomic `book` / `cancel` / `reschedule` via `db.batch`.
- Tool router `/tools/{slots,book,cancel,reschedule}` with Zod validation and a
  **code-enforced identity gate** ahead of every mutation.
- Seed generator producing always-near-future synthetic demo data.
- D1 integration tests in the real workerd runtime (@cloudflare/vitest-pool-workers);
  36 tests green.

### Sprint 0 — Foundation &amp; repo hygiene

- Project scaffold: Bun, TypeScript (strict), Hono, Wrangler, Prettier, Vitest.
- Hono Worker skeleton with `/health` (reports active resilience tier) and a
  placeholder landing page.
- Resilience-tier selection logic (`activeTier`) with unit tests.
- CI workflow (lint · typecheck · test) and a dormant CD workflow
  (GitHub Actions → Cloudflare Workers, guarded by `DEPLOY_ENABLED`).
- Documentation: README, delivery plan (`docs/PLAN.md`), seven ADRs, architecture
  diagram.
- Quality &amp; safety foundations: `SECURITY.md` policy, guardrails/evals/
  sensitive-data ADR, secure headers, CodeQL + Dependabot + `bun audit` scanning,
  and a plan workstream making safety a code-enforced, continuously-tested concern.

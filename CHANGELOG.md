# Changelog

All notable changes to Nightingale are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Sprint 2 — Full call coverage, brain, sim harness, guardrails &amp; security

- Remaining call types: confirm, FAQ (grounded knowledge), repeat-prescription
  (captured &amp; routed, never fulfilled) and urgent triage (red-flag → 999, no
  medical advice), with a new `escalations` table.
- Deterministic clinical guardrails (red-flag / injection / urgency detection).
- Swappable agent brain (ADR-0004): thin OpenAI function-calling client + a
  key-free deterministic MockBrain; shared tool schemas; versioned system prompt
  in R2 with a bundled fallback.
- Agent loop + simulated harness: scripted scenarios (tier 3, no keys) and
  free-text chat (tier 2), logging a redacted transcript + tool latency.
- Security: HMAC-verified ElevenLabs webhook; per-IP rate-limiter Durable Object.
- Eval harness + adversarial dataset (`evals/`) scoring tool selection and
  guardrail invariants; 9/9 on MockBrain in CI, live-GPT-ready.

### Sprint 1 — Data model &amp; core tool router

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

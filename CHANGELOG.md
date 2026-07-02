# Changelog

All notable changes to Nightingale are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Sprint 4 — Voice, deploy, evals, security &amp; a polished UI

- **Dashboard redesign** — a cohesive "calm clinic" design system (warm paper,
  pine-green ink, a Fraunces wordmark with a lamp mark, mono data). Accessible
  (focus rings, reduced-motion) and responsive to 390px. Portfolio screenshots in
  `docs/`.
- **Tier-1 voice, one command away** — the dashboard embeds the ElevenLabs Convai
  widget when `ELEVENLABS_AGENT_ID` is set (graceful "how to enable" state
  otherwise). Agent tool calls are authenticated by HMAC **or** a static
  `x-webhook-token`, and run through the same guarded services. `voice:config`
  generates the agent from the code's own prompt + tools; `voice:provision`
  creates it via the API; `GET /voice/signed-url` supports private agents. See
  [docs/VOICE_SETUP.md](./docs/VOICE_SETUP.md).
- **One-command deploy** — `bun run cf:bootstrap` provisions D1 + R2 + remote
  migrations idempotently; dormant GitHub CD flips on via `DEPLOY_ENABLED`. See
  [docs/DEPLOY.md](./docs/DEPLOY.md).
- **Published eval report** — `bun run eval:report` renders
  [docs/EVAL_REPORT.md](./docs/EVAL_REPORT.md) from a real run (9/9: 4 happy-path
  + 5 adversarial); numbers are never hand-typed.
- **Security review** — evidence-based verification of all controls
  ([docs/SECURITY_REVIEW.md](./docs/SECURITY_REVIEW.md)); the deployed bundle
  (hono + zod) carries no open advisories.
- README hero + 90-second tour; 97 tests green in CI.

### Sprint 3 — Live dashboard, observability &amp; confirmation emails

- Single-URL demo console (now the landing page): stats row (calls, containment,
  bookings, escalations, open tasks), live call transcript, booking log, per-tool
  latency (p50/p95), escalations and rendered emails — refreshed as HTMX
  fragments, no API keys required.
- "Run a demo call" control drives the scripted scenarios from the browser; an
  admin-token-gated "re-seed" resets the synthetic data for a clean demo.
- PII-safe read model: names are minimised on display (e.g. "John T."), and no
  raw phone / email / DOB ever reaches the UI.
- Confirmation emails: successful bookings render + store an email (recipient
  address redacted) and send it via Resend when keyed; without a key the email is
  still previewed in the dashboard, consistent with the no-keys demo tiers.
- Dashboard integration tests (page shell, live-panel updates, admin gate).

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

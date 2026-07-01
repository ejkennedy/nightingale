# Nightingale — Delivery Plan

> An AI receptionist for UK GP &amp; dental practices.
> This plan is the output of a full design grilling session; each major decision
> has a corresponding [ADR](./adr/).

## Vision

Handle the highest-volume, lowest-risk reception calls autonomously, while
**escalating anything clinical to a human**. The deliverable is a single
Cloudflare Workers URL an interviewer can click and understand in 90 seconds.

## Success criteria

- Interviewer clicks the link with **zero API keys** configured and can still run
  a booking end-to-end (tier 3 scripted replay writing to real D1).
- With keys configured, a **real spoken conversation** books an appointment.
- The dashboard shows a live transcript, a booking log, and a latency readout.
- The repo reads as credible senior-engineer work: CI/CD, ADRs, tests,
  conventional commits, a clean sprint history.

## Scope

**In scope — 5 containable call types + 2 escalations:**
`book` · `cancel` · `reschedule` · `confirm-existing` · `faq`
‖ `repeat-prescription` (capture → route) · `urgent-triage` (red-flag → human/999)

**Out of scope (documented stretch):** live telephony via Twilio/SIP, real PMS
(EMIS/SystmOne) integration, multi-practice tenancy, real patient PII/GDPR flows.

## Architecture at a glance

```
Patient ──voice/text──▶ ElevenLabs Conv AI 2.0 ──signed tool webhooks──▶ Cloudflare Worker (Hono)
                                                                          ├─ Tool router (7 tools)
                                                                          ├─ Durable Object (session + rate limit)
                                                                          ├─ R2 (versioned prompts)
                                                                          ├─ D1 (source of truth)
                                                                          └─ Resend (email)
                        Demo dashboard (Hono + HTMX) ◀── same Worker ── live transcript · booking log · latency
```

Same tool contract is hit by (1) the real ElevenLabs agent, (2) a GPT text
harness, and (3) deterministic scripted scenarios — the three resilience tiers.

## Key decisions (see ADRs)

| #                                                         | Decision                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [0001](./adr/0001-record-architecture-decisions.md)       | Record architecture decisions in ADRs                                                         |
| [0002](./adr/0002-elevenlabs-with-simulated-fallback.md)  | ElevenLabs voice **plus** a built-in simulated fallback harness (3 resilience tiers)          |
| [0003](./adr/0003-d1-as-source-of-truth.md)               | D1 is the calendar source of truth (not real Google Calendar)                                 |
| [0004](./adr/0004-openai-gpt-as-brain.md)                 | OpenAI GPT as the reasoning brain, behind a swappable interface                               |
| [0005](./adr/0005-github-actions-cd.md)                   | Deploy via GitHub Actions + scoped API token (not interactive login)                          |
| [0006](./adr/0006-graceful-degradation-and-security.md)   | Graceful degradation + security posture (public read, gated writes, HMAC, identity checks)    |
| [0007](./adr/0007-guardrails-evals-and-sensitive-data.md) | Guardrails, evals &amp; sensitive-data handling — code-enforced safety, verified continuously |

## Cross-cutting workstream — Quality, Safety &amp; Evals

Because the domain is sensitive health data, guardrails, evals, security and
testing are **continuous concerns woven through every sprint**, not a phase
([ADR-0007](./adr/0007-guardrails-evals-and-sensitive-data.md),
[SECURITY.md](../SECURITY.md)). The invariant: _safety is enforced in code and
verified by tests, never left to the prompt alone._

| Pillar             | What it means here                                                                                                                                                     | Lands in                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Sensitive data** | Synthetic-only data, data minimisation, PII redaction at the boundary, secrets hygiene                                                                                 | S1 (redaction layer) → all                     |
| **Guardrails**     | Server-enforced identity gate, no-hallucination rule, red-flag escalation, scope/injection resistance, Zod validation                                                  | S1 (identity gate) · S2 (clinical + injection) |
| **Evals**          | Versioned scenario dataset (7 call types + adversarial), harness asserting tool-selection + guardrail invariants, deterministic mock brain in CI + live GPT when keyed | S2 (harness) · S4 (full suite + report)        |
| **Security**       | HMAC webhooks, DO rate limiting, admin-gated writes, least-privilege token, headers, dependency + secret scanning (Dependabot/CodeQL/`bun audit`)                      | S0 (headers, scanning) · S2 (HMAC, rate limit) |
| **Testing**        | Unit · integration (workerd + D1) · guardrail · eval — all green in CI on every push                                                                                   | every sprint                                   |

Every user story carries acceptance criteria that include its guardrail and test
obligations; a story is not "done" until its safety assertions are tested.

## Sprint roadmap

Lightweight Agile: each sprint is a GitHub milestone; stories are issues written
as `As a <role> I can <capability>`; commits are [Conventional Commits](https://www.conventionalcommits.org/)
straight to `main`.

### Sprint 0 — Foundation &amp; repo hygiene ✅ (this sprint)

Repo, TypeScript, Hono skeleton, `/health`, Vitest, Prettier, CI + (dormant) CD
workflows, README, PLAN, ADRs, GitHub milestones + backlog issues.

### Sprint 1 — Data model + core tool router

- D1 schema: `practitioners`, `patients`, `slots`, `appointments`, `call_logs`, `events`.
- Migrations + realistic seed (3 GPs + 2 dentists, 2 weeks of slots, sample patients).
- Tools `book` / `cancel` / `reschedule` with name+DOB identity verification,
  slot-availability logic, Zod validation, structured errors.
- Integration tests in the workerd runtime against local D1.
- **Quality/safety:** server-enforced identity gate (guardrail in code); PII
  redaction helper + unit tests; secrets never logged.

### Sprint 2 — Full call coverage + GPT brain + sim harness + security

- Tools `confirm` / `faq` / `prescription` / `triage`.
- Thin OpenAI function-calling client behind an `AgentBrain` interface; system
  prompt versioned in R2; tool schemas shared with ElevenLabs.
- Sim harness: GPT free-text chat + deterministic scripted scenarios.
- HMAC webhook verification; Durable Object rate limiter + session state.
- **Quality/safety:** eval harness + versioned scenario dataset (7 call types +
  adversarial: injection, red-flags, identity mismatch, double-book, off-topic);
  deterministic mock brain for CI; clinical + scope/injection guardrails with tests.

### Sprint 3 — Dashboard + observability + email

- HTMX dashboard: live transcript (SSE/poll), booking log, latency readout
  (p50/p95 per action), email preview, tier indicator, admin-gated re-seed.
- Latency instrumentation + metrics; Resend integration.

### Sprint 4 — Real ElevenLabs voice + polish + live deploy

- ElevenLabs agent config (prompt + tool defs → Worker webhooks + HMAC secret),
  widget embed. Live CD verified. README polish (demo GIF, 90s walkthrough),
  CHANGELOG, cross-tier QA. Telephony documented as stretch.
- **Quality/safety:** full eval suite run + published report (with live GPT
  scores); security review pass; Dependabot/CodeQL/`bun audit` clean.

## Risks &amp; mitigations

| Risk                                             | Mitigation                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Cached Wrangler token can't deploy Workers (403) | Deploy via GitHub Actions with a scoped API token ([ADR-0005](./adr/0005-github-actions-cd.md))                               |
| Demo dies if an API key/quota is exhausted       | Three resilience tiers; tier 3 needs no keys ([ADR-0002](./adr/0002-elevenlabs-with-simulated-fallback.md))                   |
| Triage gives unsafe medical advice               | Hard-scripted red-flag → human/999 handoff; agent never advises ([ADR-0006](./adr/0006-graceful-degradation-and-security.md)) |
| Public dashboard griefed mid-interview           | Public read-only; writes rate-limited + admin-gated ([ADR-0006](./adr/0006-graceful-degradation-and-security.md))             |

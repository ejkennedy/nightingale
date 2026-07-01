# Security Review — Nightingale

**Date:** 2026-07-01 · **Commit reviewed:** `8761d9d` · **Reviewer:** project author (self-review)
**Scope:** the Cloudflare Worker (Hono orchestration, D1, Durable Objects), the
agent/guardrail layer, the demo dashboard, and the CI/CD supply chain. This is a
portfolio project handling **synthetic data only**; the review is written to the
standard the real system would need before touching genuine patient data.

This document complements the threat model in [SECURITY.md](../SECURITY.md): that
states the _policy_, this records a _point-in-time verification_ that the policy
is enforced in code, with file/line evidence.

## Summary

| Area                                      | Result                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Runtime dependency CVEs (deployed bundle) | ✅ **none** — the Worker bundles only `hono` + `zod`, neither has an open advisory                                           |
| Sensitive-data handling                   | ✅ PII redaction + minimisation are **code-enforced** at every boundary, not prompt-only                                     |
| Secrets management                        | ✅ no secrets committed; `.dev.vars`/`.env*` git-ignored; runtime secrets injected, never bundled                            |
| Clinical guardrails                       | ✅ identity gate, injection refusal, red-flag escalation, no-medical-advice — enforced in services and **eval-tested** (9/9) |
| Webhook authenticity                      | ✅ HMAC-SHA256, constant-time compare (Web Crypto)                                                                           |
| Abuse resistance                          | ✅ per-IP rate limiter (Durable Object) on the call endpoints                                                                |
| Automated scanning                        | ✅ CodeQL per push · Dependabot · `bun audit` in CI                                                                          |
| Residual risk                             | ⚠️ dev-tooling advisories (build/test only, accepted); CSP + prod hardening deferred to the live-deploy sprint               |

No high-severity issues were found in the deployed code path. The open items are
dev-tooling advisories that cannot reach production and hardening steps that
belong with the (not-yet-enabled) live deployment.

## Controls verified

| #   | Control                                                            | Status | Evidence                                                                                                                                                                     |
| --- | ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Synthetic data only** — no real patient data anywhere            | ✅     | `scripts/generate-seed.ts`, `src/db/seed-data.ts`; demo banner states it in the UI                                                                                           |
| 2   | **PII redacted before any log/event** (phone/email/DOB)            | ✅     | `src/db/logging.ts:45` redacts every event payload via `redactPayload`; `src/domain/redact.ts`                                                                               |
| 3   | **PII minimised in the UI** — public dashboard never shows raw PII | ✅     | `src/db/read-model.ts:114` emits `"John T."` (first name + last initial); no phone/email/DOB columns selected                                                                |
| 4   | **Confirmation email recipient redacted at rest**                  | ✅     | `src/services/appointments.ts` stores `redactEmail(patient.email)`, not the address                                                                                          |
| 5   | **Identity gate before every mutation** (name + exact DOB)         | ✅     | `identity_unverified` returned ahead of book/cancel/reschedule/confirm/prescription — `src/services/appointments.ts:71,131,162,212,236`; matcher in `src/domain/identity.ts` |
| 6   | **No medical advice** ever emitted                                 | ✅     | deterministic classifier `src/domain/guardrails.ts`; asserted by eval `no_medical_advice` (2 cases)                                                                          |
| 7   | **Prompt-injection refusal** — no tool call on injection           | ✅     | `detectInjection` in `src/domain/guardrails.ts`; eval `refuses_injection`                                                                                                    |
| 8   | **Red-flag symptoms escalate** to emergency (→ 999)                | ✅     | `detectRedFlags`/`classifyUrgency`; eval `escalates_red_flag`                                                                                                                |
| 9   | **Secrets never committed**                                        | ✅     | `.gitignore:10-13` ignores `.dev.vars`/`.env*`; `git grep` finds no key-like strings in tracked files                                                                        |
| 10  | **Webhook authenticity** — inbound tool calls signed               | ✅     | HMAC-SHA256 + length-guarded constant-time compare, `src/lib/hmac.ts:27-46`; route rejects unsigned/invalid                                                                  |
| 11  | **Rate limiting** on the call surface                              | ✅     | `src/routes/sim.ts:23-24` applies `rateLimit()` (per-IP Durable Object, `src/durable/rate-limiter.ts`)                                                                       |
| 12  | **Input validation** at the HTTP boundary                          | ✅     | Zod schemas on `/tools/*` (`src/routes/tools.ts`)                                                                                                                            |
| 13  | **Security headers** on every response                             | ✅     | `src/index.ts:14` `app.use('*', secureHeaders())`                                                                                                                            |
| 14  | **Least privilege in CI**                                          | ✅     | CodeQL job sets explicit `permissions:`; deploy is dormant behind `DEPLOY_ENABLED`                                                                                           |

## Dependency audit

`bun audit` reports 22 advisories. **All are in the build/test toolchain**
(`esbuild` dev-server SSRF, `undici`, `devalue`) reached transitively through
`wrangler` and `vitest`. They are **not part of the deployed Worker bundle**,
which contains only `hono` and `zod` — neither of which has an open advisory.

- **Production attack surface:** `hono`, `zod` — clean.
- **Dev-only advisories:** accepted and tracked. They affect a developer machine
  running `wrangler dev` / `vitest`, not the Worker. The toolchain versions
  (`@cloudflare/vitest-pool-workers@0.6.4`, `wrangler@3.114`) are **pinned for
  runtime-compatibility**; force-upgrading to clear dev advisories risks breaking
  the test runner, so it is deliberately deferred rather than auto-bumped.
- `bun audit` runs in CI (`.github/workflows/ci.yml`, informational) so new
  advisories surface on every push; Dependabot proposes grouped minor/patch bumps.

## Residual risks & recommendations

Tracked for the live-deploy sprint (Sprint 4), when real keys and a public URL
first appear:

1. **Content-Security-Policy** — `secureHeaders()` ships sane defaults but no CSP.
   Add one allow-listing the two external origins the dashboard uses (unpkg for
   HTMX, Google Fonts) before any public launch; consider self-hosting both to
   drop the third-party origins entirely.
2. **Secret provisioning** — inject `OPENAI_API_KEY`, `ELEVENLABS_*`,
   `WEBHOOK_HMAC_SECRET`, `RESEND_*`, `ADMIN_TOKEN` via `wrangler secret put`
   (never `vars`); rotate the demo `ADMIN_TOKEN` and set a strong value.
3. **Rate limiting in production** — the middleware skips the Durable Object in
   `test`; confirm it is active in the deployed environment and tune the window.
4. **Webhook exposure** — keep the ElevenLabs webhook HMAC secret long/random and
   rotate on suspicion; the endpoint already rejects unsigned requests.
5. **Dependency hygiene** — revisit the pinned toolchain when
   `@cloudflare/vitest-pool-workers` publishes a release compatible with a patched
   `esbuild`/`vite`, then clear the dev advisories.

## Sign-off

At commit `8761d9d`, the deployed code path enforces the sensitive-data and
clinical-safety controls in code (not prompt text) and is covered by the eval
suite and integration tests. No production-reachable vulnerability was
identified. The residual items above are hardening steps gated on the live
deployment and do not affect the current synthetic-data demo.

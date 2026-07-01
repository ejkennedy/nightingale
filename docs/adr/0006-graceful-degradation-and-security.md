# 6. Graceful degradation and security posture

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

The dashboard must be clickable by any interviewer in seconds, yet a public URL
that mutates a database invites abuse. In a healthcare context the agent must
also never overstep into clinical advice or act on unverified identity.

## Decision

**Access model**

- Dashboard is **public read-only** — no login, instant hand-off.
- Mutating admin actions (re-seed DB, edit prompts) require an **admin token**.
- Simulated booking writes are **rate-limited per-IP via a Durable Object**.

**Trust &amp; safety**

- Inbound ElevenLabs tool-call webhooks are **HMAC-verified** with a shared secret.
- `confirm` / `cancel` / `reschedule` require **name + date-of-birth** identity
  verification before revealing or mutating an appointment.
- `repeat-prescription` only **captures and routes**; it never fulfils.
- `urgent-triage` detects red-flag symptoms, **gives no medical advice**, and
  hands off to a human / directs to 999.

**Degradation** — missing secrets lower the resilience tier
([ADR-0002](./0002-elevenlabs-with-simulated-fallback.md)) rather than breaking
the app; the app never assumes a secret is present.

## Consequences

- Safe to hand a stranger the URL: they can explore but not grief or extract PII.
- Clear, testable safety boundaries around the clinical flows.
- Slightly more plumbing (DO rate limiter, HMAC, identity checks) — all of which
  are legitimate portfolio signals of production awareness.

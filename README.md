<div align="center">

# 🕊️ Nightingale

### An AI receptionist for UK GP &amp; dental practices

Books, cancels, reschedules and confirms appointments over voice — and safely
**escalates the clinical stuff** (repeat prescriptions, urgent triage) to humans.

[![CI](https://github.com/ejkennedy/nightingale/actions/workflows/ci.yml/badge.svg)](https://github.com/ejkennedy/nightingale/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/edge-Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Voice: ElevenLabs](https://img.shields.io/badge/voice-ElevenLabs_Conversational_AI-000000)](https://elevenlabs.io/conversational-ai)

</div>

---

## The problem

UK GP practices and dental surgeries are drowning in appointment calls. A
hospital network's 20-seat scheduling desk had **45-minute peak wait times**;
after deploying a voice AI agent, **60% of calls were fully contained** and wait
times dropped to **under 2 minutes**. Everyone in the country has stood in the
8am phone queue — the problem sells itself.

**Nightingale** is a voice agent that handles the most common call types end to
end, backed by an edge orchestration layer that is genuinely production-shaped:
signed tool webhooks, per-caller rate limiting, versioned prompts, identity
verification, and a live observability dashboard.

## What it does

**5 containable call types** the agent handles autonomously:

| Call type               | What Nightingale does                                       |
| ----------------------- | ----------------------------------------------------------- |
| 📅 **Book**             | Finds a suitable slot with the right clinician and books it |
| ❌ **Cancel**           | Verifies identity, releases the slot                        |
| 🔄 **Reschedule**       | Cancels + rebooks in one flow                               |
| ✅ **Confirm existing** | Reads back a caller's upcoming appointment                  |
| ℹ️ **FAQ**              | Opening hours, location, services, how to register          |

**2 safety-first escalations** — because a receptionist that _doesn't know its
limits_ is dangerous in healthcare:

| Flow                       | Behaviour                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| 💊 **Repeat prescription** | Captures the request and routes to a human/pharmacist — never fulfils autonomously                |
| 🚨 **Urgent triage**       | Detects red-flag symptoms, gives no medical advice, and hands off to a clinician / directs to 999 |

## Architecture

<div align="center">
  <img src="./docs/architecture.png" alt="Nightingale architecture: ElevenLabs Conversational AI → Cloudflare Workers orchestration → D1 / mock calendar / Resend, with an HTMX demo dashboard" width="620" />
</div>

- **Voice** — [ElevenLabs Conversational AI 2.0](https://elevenlabs.io/conversational-ai)
  (`eleven_flash_v2_5`, ~75ms TTS, natural turn-taking) handles STT + LLM + TTS in
  one pipeline. The agent calls back into the Worker via signed tool webhooks.
- **Orchestration** — Cloudflare Workers + [Hono](https://hono.dev). A tool
  router exposes `book` / `cancel` / `reschedule` / `confirm` / `faq` /
  `prescription` / `triage`. A Durable Object holds per-call session state and
  rate-limits abusive callers. R2 stores **versioned system prompts**.
- **Brain** — OpenAI GPT (`gpt-4o` for the live agent, `gpt-4o-mini` for the
  simulated harness). Reasoning is a swappable layer behind one interface.
- **Data** — Cloudflare **D1 is the source of truth** for practitioners,
  patients, slots and appointments, seeded with realistic UK practice data and
  resettable with one click.
- **Notifications** — [Resend](https://resend.com) email confirmations (the
  rendered email always shows in the dashboard; real send when a key is present).
- **Dashboard** — a Hono + HTMX single-page view with a **live transcript**,
  **booking log** and **latency readout**, deployed to one Workers URL you can
  hand to an interviewer.

### The "always works" guarantee — three resilience tiers

The same backend tool contract is hit identically by real voice and by a
built-in fallback harness, so the demo link **never dies**:

| Tier             | Requires       | Experience                                                        |
| ---------------- | -------------- | ----------------------------------------------------------------- |
| **1 · Voice**    | ElevenLabs key | Real spoken conversation via the browser widget                   |
| **2 · GPT chat** | OpenAI key     | Type as the patient; GPT plays the agent with real tools          |
| **3 · Scripted** | _nothing_      | One-click canned call scenarios replay against **real D1 writes** |

Hand the URL to anyone, with zero keys configured, and every
book/cancel/reschedule path still executes for real against the database.

## Responsible AI in a high-stakes domain

Healthcare reception involves **special-category health data** and vulnerable
callers, so safety is treated as a **code-enforced, continuously-tested**
property — never left to the system prompt. See
[ADR-0007](./docs/adr/0007-guardrails-evals-and-sensitive-data.md) and
[SECURITY.md](./SECURITY.md).

- 🔒 **Sensitive data** — synthetic-only data, data minimisation, PII masked
  (`07*** ***123`) before it hits any log, transcript or analytics.
- 🛡️ **Guardrails in code** — the tool router itself refuses to cancel/confirm
  without a verified name + DOB, so a jailbroken prompt still can't bypass it.
  The agent never diagnoses, never invents slots, and always escalates red-flags.
- 🧪 **Evals** — a versioned scenario dataset (all 7 call types **plus**
  adversarial cases: prompt injection, red-flag symptoms, identity mismatch,
  double-booking, off-topic) with a harness asserting tool-selection accuracy and
  every guardrail invariant. Runs against a deterministic mock brain in CI and
  live GPT when keyed.
- ✅ **Security** — HMAC-verified webhooks, per-IP rate limiting, admin-gated
  writes, least-privilege deploy token, dependency + secret scanning.
- 🔁 **Testing throughout** — unit · integration (workerd + D1) · guardrail ·
  eval, all green in CI on every push.

## Quick start

```bash
bun install
cp .dev.vars.example .dev.vars   # optional: add keys to unlock tiers 1 & 2
bun run db:reset:local           # apply migrations + seed demo data (Sprint 1+)
bun run dev                      # http://localhost:8787
```

Check it's alive: `curl localhost:8787/health` → reports the active tier.

## Tech stack

TypeScript · Cloudflare Workers · Hono · D1 · Durable Objects · R2 ·
ElevenLabs Conversational AI 2.0 · OpenAI · Resend · HTMX · Vitest · GitHub Actions

## Project status

Built in the open as portfolio work, following a lightweight Agile process
(issues → sprint milestones → conventional commits). See **[docs/PLAN.md](./docs/PLAN.md)**
for the sprint roadmap and **[docs/adr/](./docs/adr/)** for the architecture
decision records.

| Sprint | Focus                                                   | Status         |
| ------ | ------------------------------------------------------- | -------------- |
| 0      | Foundation, CI/CD, docs                                 | 🟡 in progress |
| 1      | Data model + core tool router                           | ⚪ planned     |
| 2      | Full call coverage + GPT brain + sim harness + security | ⚪ planned     |
| 3      | Dashboard + observability + email                       | ⚪ planned     |
| 4      | Real ElevenLabs voice + polish + live deploy            | ⚪ planned     |

## License

[MIT](./LICENSE) © 2026 Ethan Kennedy

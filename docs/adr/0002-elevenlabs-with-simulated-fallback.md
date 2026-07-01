# 2. ElevenLabs voice with a built-in simulated fallback

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

The headline feature is a real voice conversation via ElevenLabs Conversational
AI 2.0. But the primary consumer of this project is an **interviewer clicking a
link**. Depending solely on live ElevenLabs voice makes the demo fragile: if the
key is absent, the quota is exhausted, or the account is not live, the link is
dead — the worst possible outcome for portfolio work.

## Decision

Build one backend tool contract and drive it from **three interchangeable
front-ends**, degrading gracefully by available secrets:

1. **Tier 1 — Voice:** ElevenLabs browser widget (real STT+LLM+TTS).
2. **Tier 2 — GPT chat:** type-as-patient, GPT plays the agent with the _same_
   tools. Needs an OpenAI key.
3. **Tier 3 — Scripted:** one-click deterministic call scenarios that replay
   canned turns while executing **real tool calls against D1**. Needs no keys.

The active tier is computed from configured secrets (`activeTier()` in
`src/env.ts`) and surfaced in `/health` and the dashboard.

## Consequences

- The demo link **always works**, even with an empty secret store.
- The voice vendor is provably swappable — the agent's brain and tools are
  exercised identically without ElevenLabs, which is a strong architecture signal.
- Extra cost: we maintain a simulated harness and scripted scenarios in addition
  to the ElevenLabs agent config. Judged worth it for reliability + narrative.

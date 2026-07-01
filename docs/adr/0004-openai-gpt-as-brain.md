# 4. OpenAI GPT as the reasoning brain, behind a swappable interface

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

The agent needs an LLM to understand callers and decide which tools to invoke.
Within ElevenLabs Conversational AI the model is chosen in their console; for the
simulated harness we host the reasoning loop ourselves. Keeping both on the same
model tells a clean "same brain, two front-ends" story.

## Decision

Use **OpenAI GPT** as the default brain: `gpt-4o` for the live ElevenLabs agent,
`gpt-4o-mini` for the cheaper/faster simulated harness. The self-hosted loop sits
behind a small `AgentBrain` interface (`respond(messages, tools)`), so Claude or
Gemini can be dropped in via config without touching the tool router.

Rationale: strong OpenAI function-calling support, first-class ElevenLabs
integration, low per-call cost for demos, and it matches the author's existing
tooling preferences.

## Consequences

- Tool schemas are authored once in the OpenAI function-calling shape and reused.
- A provider swap is a config + adapter change, not a rewrite.
- We accept a soft coupling to OpenAI's function-calling semantics as the
  lingua franca; the adapter boundary keeps that contained.

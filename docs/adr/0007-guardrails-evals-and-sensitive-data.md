# 7. Guardrails, evals, and sensitive-data handling

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

Nightingale operates in healthcare reception — the data involved (name, DOB,
contact details, reason for visit) is **special-category health data** under UK
GDPR, and the agent talks to worried, sometimes vulnerable callers. An LLM that
hallucinates a slot, leaks another patient's details, gives medical advice, or
can be jailbroken out of scope is not merely buggy — it is dangerous and
non-compliant. Prompt instructions alone are **not** a sufficient control.

Quality and safety must therefore be a continuously-tested, code-enforced
property of the system, not a paragraph in a system prompt.

## Decision

Adopt a layered defence with automated verification at every layer.

### 1. Sensitive-data handling (privacy by design)

- **Synthetic data only.** The demo ships with fabricated patients; no real PII
  ever enters the system. The dashboard states this plainly.
- **Data minimisation.** Tools capture only the fields needed to act. Free-text
  clinical detail is stored only when required for routing, and flagged.
- **PII redaction at the boundary.** Phone, email and DOB are masked
  (`07*** ***123`) in stored `call_logs`, the dashboard transcript, and any
  analytics. Full values never leave D1 and are never logged.
- **Secrets hygiene.** Secrets live in `.dev.vars` (git-ignored) / Wrangler
  secrets; never committed, never logged, never echoed in errors.

### 2. Guardrails (enforced in code, not just the prompt)

- **Identity gate — server-side.** The tool router itself refuses `confirm` /
  `cancel` / `reschedule` unless name + DOB match. The prompt asks; the code
  enforces. A jailbroken prompt still cannot bypass it.
- **No-hallucination rule.** The agent may only state facts returned by a tool
  (slots, appointment times). Fabricated availability is caught by eval assertions.
- **Clinical boundaries.** `triage` runs a red-flag check and hands off to a
  human / 999 with **no medical advice**; `prescription` only captures + routes.
  These paths are deterministic, not left to model judgement.
- **Scope + injection resistance.** Off-topic and prompt-injection inputs are
  refused and redirected; covered by an adversarial eval set.
- **Input validation.** Every tool argument is Zod-validated before it touches D1.

### 3. Evals (the regression net for behaviour)

- A versioned **scenario dataset** (`evals/`) of golden caller transcripts covers
  all 7 call types plus adversarial cases: prompt injection, red-flag symptoms,
  identity mismatch, ambiguous dates, double-book attempts, off-topic requests.
- An **eval harness** runs the agent brain over the dataset and asserts:
  tool-selection accuracy, correct arguments, and guardrail invariants (never
  advised, always escalated red-flags, refused unverified identity, never leaked
  other patients).
- Runs against a **deterministic mock brain in CI** (no key, no flakiness) and,
  when `OPENAI_API_KEY` is present, against **live GPT** for a real score.
  Results are summarised in a report and the dashboard.

### 4. Security measures

- HMAC verification of inbound ElevenLabs webhooks; per-IP rate limiting (DO);
  admin token for mutating actions; least-privilege CF API token; security
  headers; dependency & secret scanning (Dependabot, `bun audit`, CodeQL).

### 5. Testing throughout

- Unit (domain: scheduling, identity, redaction) · integration (workerd + local
  D1, per tool) · guardrail (code-level refusals) · eval (scenario-based). All
  run in CI on every push. A published `SECURITY.md` documents the policy.

## Consequences

- Safety is verifiable and regression-tested, not aspirational.
- More upfront work (redaction layer, eval harness, mock brain, adversarial
  data) — but this is the core of the portfolio story: _responsible AI in a
  high-stakes domain_.
- Guardrails enforced in code mean the system is robust even if the prompt or
  model is swapped or attacked.

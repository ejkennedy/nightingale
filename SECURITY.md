# Security & Data Protection Policy

Nightingale is a **demonstration** project. It uses **synthetic data only** and
must never be connected to a real patient management system or real PII. Even so,
it is built to production security norms because the domain (UK GP/dental
reception) involves special-category health data under UK GDPR.

## Threat model (demo context)

| Threat                                                | Control                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Forged tool-call webhooks                             | HMAC-SHA256 signature verification with a shared secret                            |
| Abuse of the public demo (spam bookings)              | Per-IP rate limiting via a Durable Object                                          |
| Unauthorised data mutation (re-seed, prompt edits)    | Admin-token-gated write endpoints                                                  |
| Impersonation (booking/cancelling as another patient) | Server-enforced name + DOB identity verification                                   |
| Prompt injection / jailbreak                          | Guardrails enforced in code, not just the prompt; adversarial eval set             |
| PII leakage in logs/transcripts                       | Redaction at the boundary (phone/email/DOB masked before storage)                  |
| Leaked credentials                                    | Secrets git-ignored + Wrangler secrets; never logged; Dependabot + secret scanning |
| Vulnerable dependencies                               | `bun audit` in CI, Dependabot, CodeQL                                              |

## Data handling

- **Synthetic only.** No real patient data is stored or processed.
- **Minimisation.** Only fields needed to complete an action are captured.
- **Redaction.** Phone, email and DOB are masked before they are written to
  `call_logs`, shown in the dashboard, or sent to analytics. Unmasked values stay
  in D1 and are never logged.
- **No clinical decision-making.** The agent never diagnoses or advises; clinical
  requests are captured and routed to a human.

## LLM safety guardrails

Enforced in code and verified by the eval suite (`evals/`):

1. **Identity gate** before disclosing or mutating any appointment.
2. **No hallucinated facts** — only tool-returned data is stated.
3. **Red-flag escalation** — urgent symptoms trigger an immediate human/999
   handoff with no medical advice.
4. **Scope enforcement** — off-topic / injection attempts are refused and redirected.

## Reporting a vulnerability

This is a portfolio project, but responsible disclosure is welcome — please open
a [GitHub security advisory](https://github.com/ejkennedy/nightingale/security/advisories/new)
or a private issue rather than a public one for anything sensitive.

## Disclaimer

Nightingale is **not** a medical service and must not be used for real clinical
scheduling or advice.

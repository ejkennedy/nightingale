# 3. D1 is the calendar source of truth

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

The agent needs a calendar of appointment slots. Options ranged from a real
Google Calendar integration to a self-contained database. The brief only
requires the calendar to "look real for the demo". The overriding constraint is
that a live, hand-off demo must not break because of an external dependency
(OAuth token refresh, quotas, network).

## Decision

Cloudflare **D1 is the single source of truth** for `practitioners`, `patients`,
`slots` and `appointments`, seeded with realistic UK GP/dental data. Bookings
read and write D1 only. The dataset is resettable with one click (re-seed) so
every demo starts clean.

A real Google Calendar _mirror_ is explicitly deferred as an optional visual
flourish; if built, it must be best-effort and non-blocking.

## Consequences

- Demos are reproducible and immune to third-party auth/quota failure.
- Slot/availability logic is plain SQL we fully control and can test.
- We forgo the "look, a real Google Calendar filling up" wow. Acceptable — the
  dashboard booking log tells the same story reliably.

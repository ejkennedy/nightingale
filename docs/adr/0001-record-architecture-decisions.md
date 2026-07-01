# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

Nightingale is portfolio work whose value is partly in _showing the reasoning_,
not just the result. Design decisions were made in a structured grilling session
and should be captured where a reviewer (or future me) can see the trade-offs.

## Decision

We use Architecture Decision Records, one Markdown file per significant decision,
in `docs/adr/`, numbered sequentially, in the lightweight
[Michael Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## Consequences

- Every non-obvious choice has a paper trail with context and consequences.
- ADRs are immutable once accepted; a reversal is a new ADR that supersedes.
- The repo doubles as a worked example of deliberate technical decision-making.

# Changelog

All notable changes to Nightingale are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Sprint 0 — Foundation &amp; repo hygiene

- Project scaffold: Bun, TypeScript (strict), Hono, Wrangler, Prettier, Vitest.
- Hono Worker skeleton with `/health` (reports active resilience tier) and a
  placeholder landing page.
- Resilience-tier selection logic (`activeTier`) with unit tests.
- CI workflow (lint · typecheck · test) and a dormant CD workflow
  (GitHub Actions → Cloudflare Workers, guarded by `DEPLOY_ENABLED`).
- Documentation: README, delivery plan (`docs/PLAN.md`), seven ADRs, architecture
  diagram.
- Quality &amp; safety foundations: `SECURITY.md` policy, guardrails/evals/
  sensitive-data ADR, secure headers, CodeQL + Dependabot + `bun audit` scanning,
  and a plan workstream making safety a code-enforced, continuously-tested concern.

import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { EVAL_DATASET } from '../../evals/dataset';
import { runEvals } from '../../evals/harness';
import { MockBrain } from '../../src/agent/mock-brain';
import { resetDb } from '../helpers/db';

/**
 * The eval suite in CI: the deterministic MockBrain must pass every case
 * (tool-selection + guardrail invariants) against a seeded database. The same
 * harness scores live GPT when an OpenAI key is present (run separately).
 */

async function seed(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO practitioners (id, name, role, specialty) VALUES ('gp1', 'Dr Test', 'GP', NULL)",
    ),
    env.DB.prepare(
      "INSERT INTO patients (id, first_name, last_name, dob, phone, email) VALUES ('p-tomlin', 'John', 'Tomlin', '1979-11-05', '07700900001', 'john.tomlin@example.com')",
    ),
    env.DB.prepare(
      "INSERT INTO slots (id, practitioner_id, starts_at, duration_minutes, status) VALUES ('s1', 'gp1', '2999-01-01T09:00:00Z', 10, 'available')",
    ),
  ]);
}

beforeEach(async () => {
  await resetDb();
  await seed();
});

describe('eval suite (MockBrain)', () => {
  it('passes every case: tool selection, result correctness and guardrails', async () => {
    const ctx = { db: env.DB, now: new Date(), timeZone: 'Europe/London' };
    const report = await runEvals(new MockBrain(), ctx, 'system-prompt', EVAL_DATASET);

    const failed = report.results.filter((r) => !r.passed);
    if (failed.length) console.error('Eval failures:', JSON.stringify(failed, null, 2));

    expect(report.total).toBe(EVAL_DATASET.length);
    expect(report.passed).toBe(report.total);
    expect(report.score).toBe(1);
  });

  it('covers both happy-path and adversarial categories', () => {
    const cats = new Set(EVAL_DATASET.map((c) => c.category));
    expect(cats.has('happy')).toBe(true);
    expect(cats.has('adversarial')).toBe(true);
  });
});

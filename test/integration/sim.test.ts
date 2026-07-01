import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

/** Integration tests for the simulated call harness (scripted + free-text). */

async function seedFixture(): Promise<void> {
  const rows = [
    "INSERT INTO practitioners (id, name, role, specialty) VALUES ('gp1', 'Dr Test', 'GP', NULL)",
    "INSERT INTO patients (id, first_name, last_name, dob, phone, email) VALUES ('p1', 'John', 'Tomlin', '1979-11-05', '07700900001', 'john.tomlin@example.com')",
    "INSERT INTO slots (id, practitioner_id, starts_at, duration_minutes, status) VALUES ('s1', 'gp1', '2999-01-01T09:00:00Z', 10, 'available')",
    "INSERT INTO slots (id, practitioner_id, starts_at, duration_minutes, status) VALUES ('s2', 'gp1', '2999-01-01T09:10:00Z', 10, 'available')",
  ];
  await env.DB.batch(rows.map((sql) => env.DB.prepare(sql)));
}

const runScenario = (id: string) =>
  SELF.fetch('https://nightingale.test/sim/scenario', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });

beforeEach(seedFixture);

describe('POST /sim/scenario (tier 3, deterministic, no keys)', () => {
  it('books a real appointment end to end via the agent loop', async () => {
    const res = await runScenario('book-gp');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      transcript: unknown[];
      invocations: Array<{ name: string; result: { ok: boolean } }>;
    };
    // list_slots then a successful book_appointment.
    const book = body.invocations.find((i) => i.name === 'book_appointment');
    expect(book?.result.ok).toBe(true);
    const booked = await env.DB.prepare("SELECT status FROM slots WHERE id = 's1'").first<{
      status: string;
    }>();
    expect(booked?.status).toBe('booked');
    expect(body.transcript.length).toBeGreaterThan(0);
  });

  it('routes a red-flag triage scenario to 999 and records an escalation', async () => {
    const res = await runScenario('triage-emergency');
    const body = (await res.json()) as {
      callId: string;
      invocations: Array<{ name: string; result: { urgency?: string } }>;
    };
    const triage = body.invocations.find((i) => i.name === 'triage_symptoms');
    expect(triage?.result.urgency).toBe('emergency');
    const esc = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM escalations WHERE type='triage'",
    ).first<{
      n: number;
    }>();
    expect(esc?.n).toBe(1);
    // The call is logged with events for the dashboard.
    const events = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE call_id = ?')
      .bind(body.callId)
      .first<{ n: number }>();
    expect((events?.n ?? 0) > 0).toBe(true);
  });

  it('rejects an unknown scenario', async () => {
    const res = await runScenario('does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('POST /sim/message (free-text, MockBrain when no key)', () => {
  it('answers an FAQ and returns transcript history to continue the call', async () => {
    const res = await SELF.fetch('https://nightingale.test/sim/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'What time do you open on Saturdays?' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      assistantText: string;
      callId: string;
      history: unknown[];
    };
    expect(body.assistantText.length).toBeGreaterThan(0);
    expect(body.callId).toBeTruthy();
    expect(body.history.length).toBeGreaterThan(0);
  });
});

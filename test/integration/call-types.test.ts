import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

/** Integration tests for confirm / faq / prescription / triage. */

const IDENTITY = { lastName: 'Tomlin', dob: '1979-11-05' };

async function seedFixture(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO practitioners (id, name, role, specialty) VALUES ('gp1', 'Dr Test', 'GP', NULL)",
    ),
    env.DB.prepare(
      "INSERT INTO patients (id, first_name, last_name, dob, phone, email) VALUES ('p1', 'John', 'Tomlin', '1979-11-05', '07700900001', 'john.tomlin@example.com')",
    ),
    env.DB.prepare(
      "INSERT INTO slots (id, practitioner_id, starts_at, duration_minutes, status) VALUES ('s1', 'gp1', '2999-01-01T09:00:00Z', 10, 'available')",
    ),
  ]);
}

const post = (path: string, body: unknown) =>
  SELF.fetch(`https://nightingale.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const countEscalations = async (type: string) =>
  (
    await env.DB.prepare('SELECT COUNT(*) AS n FROM escalations WHERE type = ?')
      .bind(type)
      .first<{ n: number }>()
  )?.n ?? 0;

beforeEach(seedFixture);

describe('POST /tools/confirm', () => {
  it('reads back the upcoming appointment for a verified patient', async () => {
    await post('/tools/book', { identity: IDENTITY, slotId: 's1' });
    const res = await post('/tools/confirm', { identity: IDENTITY });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { appointments: unknown[] };
    expect(body.appointments.length).toBe(1);
  });

  it('refuses without a verified identity', async () => {
    const res = await post('/tools/confirm', { identity: { lastName: 'X', dob: '2000-01-01' } });
    expect(res.status).toBe(403);
  });
});

describe('POST /tools/faq', () => {
  it('answers opening-hours questions from grounded knowledge', async () => {
    const res = await post('/tools/faq', { question: 'what time do you close on Saturday?' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { grounded: boolean; topicId: string };
    expect(body.grounded).toBe(true);
    expect(body.topicId).toBe('opening-hours');
  });

  it('falls back safely for unknown questions instead of inventing an answer', async () => {
    const res = await post('/tools/faq', { question: 'what is the meaning of life?' });
    const body = (await res.json()) as { grounded: boolean };
    expect(body.grounded).toBe(false);
  });
});

describe('POST /tools/prescription', () => {
  it('captures and routes a repeat prescription without fulfilling it', async () => {
    const res = await post('/tools/prescription', {
      identity: IDENTITY,
      medication: 'salbutamol inhaler',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reference: string; message: string };
    expect(body.reference).toBeTruthy();
    expect(body.message.toLowerCase()).toContain('pharmacist');
    expect(await countEscalations('prescription')).toBe(1);
  });

  it('refuses to capture for an unverified caller', async () => {
    const res = await post('/tools/prescription', {
      identity: { lastName: 'X', dob: '2000-01-01' },
      medication: 'anything',
    });
    expect(res.status).toBe(403);
    expect(await countEscalations('prescription')).toBe(0);
  });
});

describe('POST /tools/triage', () => {
  it('routes red-flag symptoms straight to 999 with no medical advice', async () => {
    const res = await post('/tools/triage', {
      symptoms: 'I have severe chest pain and can’t breathe',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { urgency: string; action: string; message: string };
    expect(body.urgency).toBe('emergency');
    expect(body.action).toBe('call_999');
    expect(body.message).toContain('999');
    expect(await countEscalations('triage')).toBe(1);
  });

  it('treats an ordinary complaint as routine and offers a routine appointment', async () => {
    const res = await post('/tools/triage', {
      symptoms: 'I have had a mild sore throat for a few days',
    });
    const body = (await res.json()) as { urgency: string; action: string };
    expect(body.urgency).toBe('routine');
    expect(body.action).toBe('offer_routine');
  });
});

import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '../helpers/db';

/**
 * End-to-end integration tests for the tool router, exercised through the real
 * Worker (Hono routing + Zod validation + services + D1) in workerd. Fixtures
 * use far-future slots so they are always bookable; per-test writes roll back.
 */

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
    env.DB.prepare(
      "INSERT INTO slots (id, practitioner_id, starts_at, duration_minutes, status) VALUES ('s2', 'gp1', '2999-01-01T09:10:00Z', 10, 'available')",
    ),
  ]);
}

const post = (path: string, body: unknown) =>
  SELF.fetch(`https://nightingale.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const slotStatus = (id: string) =>
  env.DB.prepare('SELECT status FROM slots WHERE id = ?').bind(id).first<{ status: string }>();

beforeEach(async () => {
  await resetDb();
  await seedFixture();
});

describe('GET /tools/slots', () => {
  it('lists available future slots without requiring identity', async () => {
    const res = await SELF.fetch('https://nightingale.test/tools/slots?role=GP');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; slots: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.slots.length).toBe(2);
  });
});

describe('POST /tools/book', () => {
  it('books a slot for a verified patient and marks the slot booked', async () => {
    const res = await post('/tools/book', { identity: IDENTITY, slotId: 's1', reason: 'check-up' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; appointmentId: string };
    expect(body.ok).toBe(true);
    expect(body.appointmentId).toBeTruthy();
    expect((await slotStatus('s1'))?.status).toBe('booked');
  });

  it('refuses to book without a matching identity (guardrail)', async () => {
    const res = await post('/tools/book', {
      identity: { lastName: 'Wrong', dob: '1979-11-05' },
      slotId: 's1',
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('identity_unverified');
    expect((await slotStatus('s1'))?.status).toBe('available'); // unchanged
  });

  it('rejects a double-booking of the same slot', async () => {
    const first = await post('/tools/book', { identity: IDENTITY, slotId: 's1' });
    expect(first.status).toBe(200);
    const second = await post('/tools/book', { identity: IDENTITY, slotId: 's1' });
    expect(second.status).toBe(409);
  });

  it('returns 400 on an invalid body', async () => {
    const res = await post('/tools/book', { identity: { lastName: 'Tomlin' }, slotId: 's1' });
    expect(res.status).toBe(400);
  });
});

describe('POST /tools/cancel', () => {
  it('cancels the upcoming appointment and frees the slot', async () => {
    await post('/tools/book', { identity: IDENTITY, slotId: 's1' });
    const res = await post('/tools/cancel', { identity: IDENTITY });
    expect(res.status).toBe(200);
    expect((await slotStatus('s1'))?.status).toBe('available');
  });

  it('refuses to cancel for an unverified caller', async () => {
    await post('/tools/book', { identity: IDENTITY, slotId: 's1' });
    const res = await post('/tools/cancel', { identity: { lastName: 'Nope', dob: '2000-01-01' } });
    expect(res.status).toBe(403);
    expect((await slotStatus('s1'))?.status).toBe('booked'); // still booked
  });

  it('reports when there is no appointment to cancel', async () => {
    const res = await post('/tools/cancel', { identity: IDENTITY });
    expect(res.status).toBe(404);
  });
});

describe('POST /tools/reschedule', () => {
  it('moves an appointment to a new slot atomically', async () => {
    await post('/tools/book', { identity: IDENTITY, slotId: 's1' });
    const res = await post('/tools/reschedule', { identity: IDENTITY, newSlotId: 's2' });
    expect(res.status).toBe(200);
    expect((await slotStatus('s1'))?.status).toBe('available'); // old freed
    expect((await slotStatus('s2'))?.status).toBe('booked'); // new taken
  });
});

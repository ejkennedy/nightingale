import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { hmacSha256Hex } from '../../src/lib/hmac';
import { resetDb } from '../helpers/db';

/** The ElevenLabs webhook must reject unsigned/forged calls and honour valid ones. */

async function seedFixture(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO practitioners (id, name, role, specialty) VALUES ('gp1', 'Dr Test', 'GP', NULL)",
    ),
    env.DB.prepare(
      "INSERT INTO slots (id, practitioner_id, starts_at, duration_minutes, status) VALUES ('s1', 'gp1', '2999-01-01T09:00:00Z', 10, 'available')",
    ),
  ]);
}

const send = (body: unknown, signature?: string) =>
  SELF.fetch('https://nightingale.test/webhooks/elevenlabs/tool', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-elevenlabs-signature': signature } : {}),
    },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await resetDb();
  await seedFixture();
});

describe('POST /webhooks/elevenlabs/tool', () => {
  it('rejects a request with no signature (401)', async () => {
    const res = await send({ tool: 'list_slots', parameters: {} });
    expect(res.status).toBe(401);
  });

  it('rejects a request with a forged signature (401)', async () => {
    const res = await send({ tool: 'list_slots', parameters: {} }, 'deadbeef');
    expect(res.status).toBe(401);
  });

  it('dispatches a correctly-signed tool call through the guarded services', async () => {
    const payload = JSON.stringify({ tool: 'list_slots', parameters: { role: 'GP' } });
    const signature = await hmacSha256Hex('test-secret', payload);
    const res = await SELF.fetch('https://nightingale.test/webhooks/elevenlabs/tool', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-elevenlabs-signature': signature },
      body: payload,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; slots: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.slots.length).toBe(1);
  });
});

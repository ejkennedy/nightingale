import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '../helpers/db';

/** The dashboard page + its HTMX fragments + the admin re-seed gate. */

async function seedFixture(): Promise<void> {
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

const get = (path: string) => SELF.fetch(`https://nightingale.test${path}`);
const runScenario = (id: string) =>
  SELF.fetch('https://nightingale.test/ui/run-scenario', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id }).toString(),
  });

beforeEach(async () => {
  await resetDb();
  await seedFixture();
});

describe('dashboard page', () => {
  it('renders the shell with the agent name and demo controls', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Nightingale');
    expect(html).toContain('Run a demo call');
    expect(html).toContain('Demonstration only'); // synthetic-data banner
  });
});

describe('running a scenario updates the live panels + email', () => {
  it('books, then shows it in the booking log, transcript, latency and email', async () => {
    const run = await runScenario('book-gp');
    expect(run.status).toBe(200);

    const bookings = await (await get('/ui/bookings')).text();
    expect(bookings).toContain('John T.'); // minimised name
    expect(bookings).toContain('Dr Test');

    const transcript = await (await get('/ui/transcript')).text();
    expect(transcript).toContain('Caller');

    const latency = await (await get('/ui/latency')).text();
    expect(latency).toContain('book_appointment');

    const email = await (await get('/ui/email')).text();
    expect(email.toLowerCase()).toContain('confirmation');
    expect(email).toContain('preview (no key)'); // no Resend key in tests
  });
});

describe('admin re-seed gate', () => {
  it('rejects a missing/invalid token with 401', async () => {
    const res = await SELF.fetch('https://nightingale.test/ui/reseed', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: 'wrong' }).toString(),
    });
    expect(res.status).toBe(401);
  });

  it('re-seeds with the correct admin token', async () => {
    const res = await SELF.fetch('https://nightingale.test/ui/reseed', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: 'test-admin' }).toString(),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Re-seeded');
    const slots = await env.DB.prepare('SELECT COUNT(*) AS n FROM slots').first<{ n: number }>();
    expect((slots?.n ?? 0) > 0).toBe(true);
  });
});

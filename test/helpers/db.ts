import { env } from 'cloudflare:test';

/**
 * Reset all D1 tables to empty — belt-and-braces cleanup so each test starts
 * from a known state regardless of pool storage behaviour. Order respects
 * foreign keys.
 */
export async function resetDb(): Promise<void> {
  const tables = [
    'events',
    'escalations',
    'appointments',
    'slots',
    'call_logs',
    'patients',
    'practitioners',
  ];
  await env.DB.batch(tables.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
}

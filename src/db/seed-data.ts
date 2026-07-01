/**
 * Runtime database seeder — the code behind the one-click re-seed (ADR-0003).
 * Clears all data and inserts synthetic practitioners, patients and always-
 * near-future slots relative to `now`, so a re-seed always yields bookable
 * appointments. Times are London wall-clock converted to stored UTC.
 */

const TZ = 'Europe/London';

const PRACTITIONERS = [
  { id: 'gp-okafor', name: 'Dr Sarah Okafor', role: 'GP', specialty: 'General practice' },
  { id: 'gp-patel', name: 'Dr Raj Patel', role: 'GP', specialty: 'General practice' },
  { id: 'gp-campbell', name: 'Dr Fiona Campbell', role: 'GP', specialty: "Women's health" },
  {
    id: 'dentist-hughes',
    name: 'Ms Alice Hughes',
    role: 'Dentist',
    specialty: 'General dentistry',
  },
  {
    id: 'dentist-boateng',
    name: 'Mr Kofi Boateng',
    role: 'Dentist',
    specialty: 'General dentistry',
  },
] as const;

const PATIENTS = [
  {
    id: 'p-tomlin',
    first: 'John',
    last: 'Tomlin',
    dob: '1979-11-05',
    phone: '07700900001',
    email: 'john.tomlin@example.com',
  },
  {
    id: 'p-ahmed',
    first: 'Yusuf',
    last: 'Ahmed',
    dob: '1990-06-14',
    phone: '07700900002',
    email: 'yusuf.ahmed@example.com',
  },
  {
    id: 'p-clarke',
    first: 'Emily',
    last: 'Clarke',
    dob: '2001-01-30',
    phone: '07700900003',
    email: 'emily.clarke@example.com',
  },
  {
    id: 'p-nowak',
    first: 'Marta',
    last: 'Nowak',
    dob: '1966-09-09',
    phone: '07700900004',
    email: 'marta.nowak@example.com',
  },
  {
    id: 'p-reid',
    first: 'Grace',
    last: 'Reid',
    dob: '1958-12-01',
    phone: '07700900005',
    email: 'grace.reid@example.com',
  },
  {
    id: 'p-osborne',
    first: 'Daniel',
    last: 'Osborne',
    dob: '1988-07-19',
    phone: '07700900006',
    email: 'daniel.osborne@example.com',
  },
] as const;

const GP_TIMES = ['09:00', '09:10', '09:20', '09:30', '11:00', '11:10', '15:00', '15:10'];
const DENTIST_TIMES = ['09:00', '09:20', '09:40', '14:00', '14:20'];

function londonOffsetMinutes(utc: Date): number {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(utc)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return (asUtc - utc.getTime()) / 60000;
}

function londonToUtcIso(y: number, mo: number, d: number, h: number, mi: number): string {
  let ts = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++)
    ts = Date.UTC(y, mo - 1, d, h, mi) - londonOffsetMinutes(new Date(ts)) * 60000;
  return new Date(ts).toISOString().replace('.000Z', 'Z');
}

/** Clear everything and re-seed with fresh near-future demo data. */
export async function seedDatabase(db: D1Database, now: Date): Promise<{ slots: number }> {
  const stmts: D1PreparedStatement[] = [];
  for (const t of [
    'emails',
    'events',
    'escalations',
    'appointments',
    'slots',
    'call_logs',
    'patients',
    'practitioners',
  ])
    stmts.push(db.prepare(`DELETE FROM ${t}`));

  for (const p of PRACTITIONERS)
    stmts.push(
      db
        .prepare('INSERT INTO practitioners (id, name, role, specialty) VALUES (?, ?, ?, ?)')
        .bind(p.id, p.name, p.role, p.specialty),
    );
  for (const p of PATIENTS)
    stmts.push(
      db
        .prepare(
          'INSERT INTO patients (id, first_name, last_name, dob, phone, email) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(p.id, p.first, p.last, p.dob, p.phone, p.email),
    );

  let slotCount = 0;
  let added = 0;
  for (let offset = 1; offset <= 20 && added < 14; offset++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
    );
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    added++;
    const [y, mo, da] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    for (const pr of PRACTITIONERS) {
      const times = pr.role === 'Dentist' ? DENTIST_TIMES : GP_TIMES;
      const dur = pr.role === 'Dentist' ? 20 : 10;
      for (const t of times) {
        const [h, mi] = t.split(':').map(Number);
        const iso = londonToUtcIso(y, mo, da, h!, mi!);
        const id = `slot-${pr.id}-${y}${String(mo).padStart(2, '0')}${String(da).padStart(2, '0')}-${t.replace(':', '')}`;
        stmts.push(
          db
            .prepare(
              'INSERT INTO slots (id, practitioner_id, starts_at, duration_minutes, status) VALUES (?, ?, ?, ?, ?)',
            )
            .bind(id, pr.id, iso, dur, 'available'),
        );
        slotCount++;
      }
    }
  }

  await db.batch(stmts);
  return { slots: slotCount };
}

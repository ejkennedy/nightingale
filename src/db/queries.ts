/**
 * D1 data-access layer. Raw SQL only — business rules (identity gate, booking
 * orchestration) live in src/services/appointments.ts so the guardrails are
 * visible and testable in one place.
 */
import { matchesIdentity } from '../domain/identity';
import type { Appointment, IdentityClaim, Patient, Slot, SlotOffer } from '../domain/types';

/** A slot joined with its practitioner + a live appointment, for lookups. */
export interface BookedAppointment {
  appointment: Appointment;
  slot: Slot;
  practitionerName: string;
}

/**
 * Find the patient satisfying an identity claim. Narrows by DOB in SQL, then
 * applies the normalised name match in code (so accents/case/punctuation in the
 * spoken name don't defeat the check). Returns null if none/ambiguous match.
 */
export async function findPatientByIdentity(
  db: D1Database,
  claim: IdentityClaim,
): Promise<Patient | null> {
  const { results } = await db
    .prepare('SELECT * FROM patients WHERE dob = ?')
    .bind(claim.dob)
    .all<Patient>();
  const matches = results.filter((p) => matchesIdentity(p, claim));
  return matches.length === 1 ? matches[0]! : null;
}

/** Available future slots, optionally filtered by role or practitioner. */
export async function findAvailableSlots(
  db: D1Database,
  opts: { role?: string; practitionerId?: string; fromIso: string; limit?: number },
): Promise<SlotOffer[]> {
  const clauses = ["s.status = 'available'", 's.starts_at > ?1'];
  const binds: unknown[] = [opts.fromIso];
  if (opts.role) {
    binds.push(opts.role);
    clauses.push(`p.role = ?${binds.length}`);
  }
  if (opts.practitionerId) {
    binds.push(opts.practitionerId);
    clauses.push(`s.practitioner_id = ?${binds.length}`);
  }
  binds.push(Math.min(opts.limit ?? 5, 20));
  const sql = `
    SELECT s.id AS slotId, p.name AS practitionerName, p.role AS role,
           s.starts_at AS startsAt, s.duration_minutes AS durationMinutes
    FROM slots s JOIN practitioners p ON p.id = s.practitioner_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.starts_at ASC
    LIMIT ?${binds.length}`;
  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<SlotOffer>();
  return results;
}

export async function getSlotById(db: D1Database, slotId: string): Promise<Slot | null> {
  return db.prepare('SELECT * FROM slots WHERE id = ?').bind(slotId).first<Slot>();
}

/** The patient's upcoming (future, non-cancelled) appointments, soonest first. */
export async function getUpcomingAppointments(
  db: D1Database,
  patientId: string,
  fromIso: string,
): Promise<BookedAppointment[]> {
  const sql = `
    SELECT a.id AS a_id, a.slot_id, a.patient_id, a.reason, a.status, a.created_at, a.cancelled_at,
           s.id AS s_id, s.practitioner_id, s.starts_at, s.duration_minutes, s.status AS slot_status,
           p.name AS practitioner_name
    FROM appointments a
    JOIN slots s ON s.id = a.slot_id
    JOIN practitioners p ON p.id = s.practitioner_id
    WHERE a.patient_id = ? AND a.status = 'booked' AND s.starts_at > ?
    ORDER BY s.starts_at ASC`;
  const { results } = await db.prepare(sql).bind(patientId, fromIso).all<Record<string, unknown>>();
  return results.map((r) => ({
    appointment: {
      id: r.a_id as string,
      slot_id: r.slot_id as string,
      patient_id: r.patient_id as string,
      reason: (r.reason as string) ?? null,
      status: r.status as Appointment['status'],
      created_at: r.created_at as string,
      cancelled_at: (r.cancelled_at as string) ?? null,
    },
    slot: {
      id: r.s_id as string,
      practitioner_id: r.practitioner_id as string,
      starts_at: r.starts_at as string,
      duration_minutes: r.duration_minutes as number,
      status: r.slot_status as Slot['status'],
    },
    practitionerName: r.practitioner_name as string,
  }));
}

/**
 * Insert an appointment and mark its slot booked, atomically. The partial unique
 * index on appointments(slot_id) rejects a concurrent double-book, so a failed
 * batch (rolled back) surfaces as a conflict.
 */
export async function insertBooking(
  db: D1Database,
  args: { appointmentId: string; slotId: string; patientId: string; reason: string | null },
): Promise<void> {
  await db.batch([
    db
      .prepare('INSERT INTO appointments (id, slot_id, patient_id, reason) VALUES (?, ?, ?, ?)')
      .bind(args.appointmentId, args.slotId, args.patientId, args.reason),
    db
      .prepare("UPDATE slots SET status = 'booked' WHERE id = ? AND status = 'available'")
      .bind(args.slotId),
  ]);
}

/** Cancel an appointment and free its slot, atomically. */
export async function cancelBooking(
  db: D1Database,
  args: { appointmentId: string; slotId: string; nowIso: string },
): Promise<void> {
  await db.batch([
    db
      .prepare("UPDATE appointments SET status = 'cancelled', cancelled_at = ? WHERE id = ?")
      .bind(args.nowIso, args.appointmentId),
    db.prepare("UPDATE slots SET status = 'available' WHERE id = ?").bind(args.slotId),
  ]);
}

/** Record a captured request routed to a human (prescription / triage). */
export async function insertEscalation(
  db: D1Database,
  args: {
    id: string;
    type: 'prescription' | 'triage' | 'other';
    patientId: string | null;
    summary: string;
    urgency: 'routine' | 'urgent' | 'emergency' | null;
  },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO escalations (id, type, patient_id, summary, urgency) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(args.id, args.type, args.patientId, args.summary, args.urgency)
    .run();
}

/** Reschedule: cancel the old booking and create the new one in one transaction. */
export async function rescheduleBooking(
  db: D1Database,
  args: {
    oldAppointmentId: string;
    oldSlotId: string;
    newAppointmentId: string;
    newSlotId: string;
    patientId: string;
    reason: string | null;
    nowIso: string;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare("UPDATE appointments SET status = 'cancelled', cancelled_at = ? WHERE id = ?")
      .bind(args.nowIso, args.oldAppointmentId),
    db.prepare("UPDATE slots SET status = 'available' WHERE id = ?").bind(args.oldSlotId),
    db
      .prepare('INSERT INTO appointments (id, slot_id, patient_id, reason) VALUES (?, ?, ?, ?)')
      .bind(args.newAppointmentId, args.newSlotId, args.patientId, args.reason),
    db
      .prepare("UPDATE slots SET status = 'booked' WHERE id = ? AND status = 'available'")
      .bind(args.newSlotId),
  ]);
}

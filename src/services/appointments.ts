/**
 * Appointment orchestration — book / cancel / reschedule / list.
 *
 * This is where the guardrails are ENFORCED (ADR-0006/0007): every mutation runs
 * the identity gate first, in code, before any data is disclosed or changed. A
 * jailbroken prompt cannot reach a mutation without a matching name + DOB because
 * these functions — not the prompt — hold the gate.
 */
import { classifyUrgency, detectRedFlags, type Urgency } from '../domain/guardrails';
import { answerFromKnowledge } from '../domain/knowledge';
import { redactPayload } from '../domain/redact';
import { formatSlotHuman } from '../domain/scheduling';
import { isBookable } from '../domain/scheduling';
import type { IdentityClaim, SlotOffer } from '../domain/types';
import {
  cancelBooking,
  findAvailableSlots,
  findPatientByIdentity,
  getSlotById,
  getUpcomingAppointments,
  insertBooking,
  insertEscalation,
  rescheduleBooking,
  type BookedAppointment,
} from '../db/queries';

export type ToolErrorCode =
  | 'identity_unverified'
  | 'slot_unavailable'
  | 'slot_not_found'
  | 'no_appointment'
  | 'ambiguous_appointment'
  | 'conflict';

export type ToolResult<T> =
  ({ ok: true } & T) | { ok: false; code: ToolErrorCode; message: string; details?: unknown };

function fail(code: ToolErrorCode, message: string, details?: unknown): ToolResult<never> {
  return { ok: false, code, message, details };
}

export interface Ctx {
  db: D1Database;
  now: Date;
  timeZone: string;
}

/** Browse availability. No identity required — nothing personal is disclosed. */
export async function listSlots(
  ctx: Ctx,
  opts: { role?: string; practitionerId?: string; limit?: number },
): Promise<ToolResult<{ slots: Array<SlotOffer & { when: string }> }>> {
  const slots = await findAvailableSlots(ctx.db, { ...opts, fromIso: ctx.now.toISOString() });
  return {
    ok: true,
    slots: slots.map((s) => ({ ...s, when: formatSlotHuman(s.startsAt, ctx.timeZone) })),
  };
}

/** Book a specific slot for an identity-verified patient. */
export async function bookAppointment(
  ctx: Ctx,
  input: { identity: IdentityClaim; slotId: string; reason?: string },
): Promise<ToolResult<{ appointmentId: string; when: string; practitionerName: string }>> {
  const patient = await findPatientByIdentity(ctx.db, input.identity);
  if (!patient) return fail('identity_unverified', 'Could not verify your identity.');

  const slot = await getSlotById(ctx.db, input.slotId);
  if (!slot) return fail('slot_not_found', 'That appointment slot does not exist.');
  if (!isBookable(slot, ctx.now)) {
    return fail('slot_unavailable', 'That slot is no longer available.');
  }

  const appointmentId = crypto.randomUUID();
  try {
    await insertBooking(ctx.db, {
      appointmentId,
      slotId: slot.id,
      patientId: patient.id,
      reason: input.reason ?? null,
    });
  } catch {
    return fail('conflict', 'That slot was just taken — please choose another.');
  }

  const offer = await getSlotById(ctx.db, slot.id);
  const when = formatSlotHuman(offer!.starts_at, ctx.timeZone);
  const practitionerName = await practitionerNameForSlot(ctx.db, slot.id);
  return { ok: true, appointmentId, when, practitionerName };
}

/** Cancel an upcoming appointment for an identity-verified patient. */
export async function cancelAppointment(
  ctx: Ctx,
  input: { identity: IdentityClaim; appointmentId?: string },
): Promise<ToolResult<{ cancelledId: string; when: string }>> {
  const patient = await findPatientByIdentity(ctx.db, input.identity);
  if (!patient) return fail('identity_unverified', 'Could not verify your identity.');

  const upcoming = await getUpcomingAppointments(ctx.db, patient.id, ctx.now.toISOString());
  const target = selectTarget(upcoming, input.appointmentId);
  if (target.kind === 'none') return fail('no_appointment', 'You have no upcoming appointment.');
  if (target.kind === 'ambiguous') {
    return fail('ambiguous_appointment', 'You have more than one appointment — which one?', {
      appointments: describeAll(upcoming, ctx.timeZone),
    });
  }

  await cancelBooking(ctx.db, {
    appointmentId: target.item.appointment.id,
    slotId: target.item.slot.id,
    nowIso: ctx.now.toISOString(),
  });
  return {
    ok: true,
    cancelledId: target.item.appointment.id,
    when: formatSlotHuman(target.item.slot.starts_at, ctx.timeZone),
  };
}

/** Move an upcoming appointment to a new slot, atomically. */
export async function rescheduleAppointment(
  ctx: Ctx,
  input: { identity: IdentityClaim; newSlotId: string; appointmentId?: string; reason?: string },
): Promise<
  ToolResult<{ appointmentId: string; from: string; to: string; practitionerName: string }>
> {
  const patient = await findPatientByIdentity(ctx.db, input.identity);
  if (!patient) return fail('identity_unverified', 'Could not verify your identity.');

  const upcoming = await getUpcomingAppointments(ctx.db, patient.id, ctx.now.toISOString());
  const target = selectTarget(upcoming, input.appointmentId);
  if (target.kind === 'none') return fail('no_appointment', 'You have no upcoming appointment.');
  if (target.kind === 'ambiguous') {
    return fail('ambiguous_appointment', 'You have more than one appointment — which one?', {
      appointments: describeAll(upcoming, ctx.timeZone),
    });
  }

  const newSlot = await getSlotById(ctx.db, input.newSlotId);
  if (!newSlot) return fail('slot_not_found', 'That new slot does not exist.');
  if (!isBookable(newSlot, ctx.now))
    return fail('slot_unavailable', 'That new slot is not available.');

  const newAppointmentId = crypto.randomUUID();
  try {
    await rescheduleBooking(ctx.db, {
      oldAppointmentId: target.item.appointment.id,
      oldSlotId: target.item.slot.id,
      newAppointmentId,
      newSlotId: newSlot.id,
      patientId: patient.id,
      reason: input.reason ?? target.item.appointment.reason,
      nowIso: ctx.now.toISOString(),
    });
  } catch {
    return fail('conflict', 'That new slot was just taken — please choose another.');
  }

  return {
    ok: true,
    appointmentId: newAppointmentId,
    from: formatSlotHuman(target.item.slot.starts_at, ctx.timeZone),
    to: formatSlotHuman(newSlot.starts_at, ctx.timeZone),
    practitionerName: await practitionerNameForSlot(ctx.db, newSlot.id),
  };
}

/** Read back an identity-verified patient's upcoming appointments. */
export async function confirmAppointments(
  ctx: Ctx,
  input: { identity: IdentityClaim },
): Promise<
  ToolResult<{
    appointments: Array<{ appointmentId: string; when: string; practitionerName: string }>;
  }>
> {
  const patient = await findPatientByIdentity(ctx.db, input.identity);
  if (!patient) return fail('identity_unverified', 'Could not verify your identity.');
  const upcoming = await getUpcomingAppointments(ctx.db, patient.id, ctx.now.toISOString());
  return { ok: true, appointments: describeAll(upcoming, ctx.timeZone) };
}

/** Answer a practice FAQ strictly from the grounded knowledge base. */
export function answerFaq(input: { question: string }): ToolResult<{
  answer: string;
  grounded: boolean;
  topicId?: string;
}> {
  const match = answerFromKnowledge(input.question);
  return { ok: true, answer: match.answer, grounded: match.matched, topicId: match.topicId };
}

/**
 * Capture a repeat-prescription request and route it to a human. Never fulfils
 * or confirms medication (ADR-0006/0007) — it only records and hands off.
 */
export async function capturePrescription(
  ctx: Ctx,
  input: { identity: IdentityClaim; medication: string; notes?: string },
): Promise<ToolResult<{ reference: string; message: string }>> {
  const patient = await findPatientByIdentity(ctx.db, input.identity);
  if (!patient) return fail('identity_unverified', 'Could not verify your identity.');

  const reference = crypto.randomUUID();
  await insertEscalation(ctx.db, {
    id: reference,
    type: 'prescription',
    patientId: patient.id,
    summary: `Repeat prescription request: ${input.medication}`.slice(0, 200),
    urgency: 'routine',
  });
  return {
    ok: true,
    reference,
    message:
      `Thanks — I've logged your repeat-prescription request for ${input.medication} and passed it to the practice pharmacist. ` +
      "You'll be contacted once it's ready. I can't issue medication myself.",
  };
}

export type TriageAction = 'call_999' | 'human_callback' | 'offer_routine';

/**
 * Assess urgency from symptoms and route accordingly. Gives NO medical advice
 * and never diagnoses — red flags go straight to 999/human. Stores only a
 * minimal, non-clinical summary (data minimisation).
 */
export async function triage(
  ctx: Ctx,
  input: { symptoms: string; identity?: IdentityClaim },
): Promise<
  ToolResult<{ urgency: Urgency; action: TriageAction; message: string; reference: string }>
> {
  const flags = detectRedFlags(input.symptoms);
  const urgency = classifyUrgency(input.symptoms);

  const patient = input.identity ? await findPatientByIdentity(ctx.db, input.identity) : null;
  const reference = crypto.randomUUID();
  await insertEscalation(ctx.db, {
    id: reference,
    type: 'triage',
    patientId: patient?.id ?? null,
    summary: JSON.stringify(redactPayload({ triage: urgency, flags: flags.matched })),
    urgency,
  });

  let action: TriageAction;
  let message: string;
  if (urgency === 'emergency') {
    action = 'call_999';
    message =
      'This could be a medical emergency. Please hang up and call 999 straight away. ' +
      "I'm alerting a clinician now. I can't give medical advice.";
  } else if (urgency === 'urgent') {
    action = 'human_callback';
    message =
      "I can't give medical advice, but this needs to be seen urgently. I've flagged it and the " +
      'practice will call you back as a priority. If it gets worse, call 111, or 999 in an emergency.';
  } else {
    action = 'offer_routine';
    message =
      "I can't give medical advice. This doesn't sound like an emergency — would you like me to book " +
      'a routine appointment, or pass a note to a clinician?';
  }
  return { ok: true, urgency, action, message, reference };
}

// --- helpers ---

type Target = { kind: 'one'; item: BookedAppointment } | { kind: 'none' } | { kind: 'ambiguous' };

function selectTarget(upcoming: BookedAppointment[], appointmentId?: string): Target {
  if (appointmentId) {
    const item = upcoming.find((u) => u.appointment.id === appointmentId);
    return item ? { kind: 'one', item } : { kind: 'none' };
  }
  if (upcoming.length === 0) return { kind: 'none' };
  if (upcoming.length === 1) return { kind: 'one', item: upcoming[0]! };
  return { kind: 'ambiguous' };
}

function describeAll(upcoming: BookedAppointment[], timeZone: string) {
  return upcoming.map((u) => ({
    appointmentId: u.appointment.id,
    when: formatSlotHuman(u.slot.starts_at, timeZone),
    practitionerName: u.practitionerName,
  }));
}

async function practitionerNameForSlot(db: D1Database, slotId: string): Promise<string> {
  const row = await db
    .prepare(
      'SELECT p.name AS name FROM slots s JOIN practitioners p ON p.id = s.practitioner_id WHERE s.id = ?',
    )
    .bind(slotId)
    .first<{ name: string }>();
  return row?.name ?? 'the clinician';
}

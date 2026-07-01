/**
 * Tool router — the contract hit identically by the real ElevenLabs agent, the
 * GPT sim harness, and the scripted replays (ADR-0002). Every input is
 * Zod-validated before it reaches the service layer, and the identity gate is
 * enforced downstream in code (ADR-0007).
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import {
  answerFaq,
  bookAppointment,
  cancelAppointment,
  capturePrescription,
  confirmAppointments,
  listSlots,
  rescheduleAppointment,
  triage,
  type ToolErrorCode,
  type ToolResult,
} from '../services/appointments';

const identity = z.object({
  lastName: z.string().min(1).max(80),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD'),
});

const bookBody = z.object({
  identity,
  slotId: z.string().min(1),
  reason: z.string().max(140).optional(),
});
const cancelBody = z.object({ identity, appointmentId: z.string().min(1).optional() });
const rescheduleBody = z.object({
  identity,
  newSlotId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  reason: z.string().max(140).optional(),
});
const confirmBody = z.object({ identity });
const faqBody = z.object({ question: z.string().min(1).max(300) });
const prescriptionBody = z.object({
  identity,
  medication: z.string().min(1).max(120),
  notes: z.string().max(300).optional(),
});
const triageBody = z.object({
  symptoms: z.string().min(1).max(500),
  identity: identity.optional(),
});

/** HTTP status for each guarded failure code. */
const STATUS: Record<ToolErrorCode, 400 | 403 | 404 | 409> = {
  identity_unverified: 403,
  slot_not_found: 404,
  no_appointment: 404,
  slot_unavailable: 409,
  ambiguous_appointment: 409,
  conflict: 409,
};

function respond<T>(c: Context<{ Bindings: Env }>, result: ToolResult<T>) {
  if (result.ok) return c.json(result, 200);
  return c.json(result, STATUS[result.code]);
}

export const tools = new Hono<{ Bindings: Env }>();

const ctxFrom = (env: Env) => ({
  db: env.DB,
  now: new Date(),
  timeZone: env.PRACTICE_TIMEZONE,
});

/** GET /tools/slots — browse availability (no identity needed). */
tools.get('/slots', async (c) => {
  const role = c.req.query('role');
  const practitionerId = c.req.query('practitionerId');
  const limit = Number(c.req.query('limit')) || undefined;
  const result = await listSlots(ctxFrom(c.env), { role, practitionerId, limit });
  return respond(c, result);
});

tools.post('/book', async (c) => {
  const parsed = bookBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ ok: false, code: 'invalid_input', issues: parsed.error.issues }, 400);
  return respond(c, await bookAppointment(ctxFrom(c.env), parsed.data));
});

tools.post('/cancel', async (c) => {
  const parsed = cancelBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ ok: false, code: 'invalid_input', issues: parsed.error.issues }, 400);
  return respond(c, await cancelAppointment(ctxFrom(c.env), parsed.data));
});

tools.post('/reschedule', async (c) => {
  const parsed = rescheduleBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ ok: false, code: 'invalid_input', issues: parsed.error.issues }, 400);
  return respond(c, await rescheduleAppointment(ctxFrom(c.env), parsed.data));
});

tools.post('/confirm', async (c) => {
  const parsed = confirmBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ ok: false, code: 'invalid_input', issues: parsed.error.issues }, 400);
  return respond(c, await confirmAppointments(ctxFrom(c.env), parsed.data));
});

tools.post('/faq', async (c) => {
  const parsed = faqBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ ok: false, code: 'invalid_input', issues: parsed.error.issues }, 400);
  return respond(c, answerFaq(parsed.data));
});

tools.post('/prescription', async (c) => {
  const parsed = prescriptionBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ ok: false, code: 'invalid_input', issues: parsed.error.issues }, 400);
  return respond(c, await capturePrescription(ctxFrom(c.env), parsed.data));
});

tools.post('/triage', async (c) => {
  const parsed = triageBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ ok: false, code: 'invalid_input', issues: parsed.error.issues }, 400);
  return respond(c, await triage(ctxFrom(c.env), parsed.data));
});

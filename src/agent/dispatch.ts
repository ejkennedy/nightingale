/**
 * Execute a brain-issued tool call against the service layer. This is the single
 * choke point where model output becomes a real action — every path runs through
 * the guarded services, so the identity gate and clinical rules always apply.
 */
import type { ToolCall } from './brain';
import {
  answerFaq,
  bookAppointment,
  cancelAppointment,
  capturePrescription,
  confirmAppointments,
  listSlots,
  rescheduleAppointment,
  triage,
  type Ctx,
} from '../services/appointments';

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** The serialisable result of a tool call, always carrying an `ok` flag. */
export type ToolExecResult = { ok: boolean; [key: string]: unknown };

export async function executeToolCall(ctx: Ctx, call: ToolCall): Promise<ToolExecResult> {
  const a = call.arguments;
  const identity = { lastName: str(a.lastName), dob: str(a.dob) };

  switch (call.name) {
    case 'list_slots':
      return listSlots(ctx, {
        role: optStr(a.role),
        limit: typeof a.limit === 'number' ? a.limit : undefined,
      });
    case 'book_appointment':
      return bookAppointment(ctx, { identity, slotId: str(a.slotId), reason: optStr(a.reason) });
    case 'cancel_appointment':
      return cancelAppointment(ctx, { identity, appointmentId: optStr(a.appointmentId) });
    case 'reschedule_appointment':
      return rescheduleAppointment(ctx, {
        identity,
        newSlotId: str(a.newSlotId),
        appointmentId: optStr(a.appointmentId),
        reason: optStr(a.reason),
      });
    case 'confirm_appointment':
      return confirmAppointments(ctx, { identity });
    case 'answer_faq':
      return answerFaq({ question: str(a.question) });
    case 'capture_prescription':
      return capturePrescription(ctx, {
        identity,
        medication: str(a.medication),
        notes: optStr(a.notes),
      });
    case 'triage_symptoms':
      return triage(ctx, {
        symptoms: str(a.symptoms),
        identity: a.lastName && a.dob ? identity : undefined,
      });
    default:
      return { ok: false, code: 'unknown_tool', message: `Unknown tool: ${call.name}` };
  }
}

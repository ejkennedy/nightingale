/**
 * Deterministic, key-free brain for CI, the scripted resilience tier, and evals.
 *
 * It is a transparent intent-router, NOT a clever model — it detects the caller's
 * intent and extracts entities with rules, so tests never flake and never cost a
 * token. Safety ordering matters: injection is refused first, red flags triage
 * first; only then are ordinary appointment intents considered.
 */
import { detectInjection, detectRedFlags } from '../domain/guardrails';
import type { AgentBrain, BrainMessage, BrainTurn, ToolCall, ToolSchema } from './brain';

const SYMPTOM_WORDS =
  /\b(symptom|pain|hurts?|ill|unwell|sick|cough|fever|temperature|dizzy|rash|bleeding|breath|vomit|nausea|headache|sore)\b/;

function lastUserMessage(messages: BrainMessage[]): string {
  return [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
}

function extractIdentity(text: string): { lastName?: string; dob?: string } {
  const dob = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  const name = text.match(/\b(?:name is|i'?m|this is|surname|last name)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  let lastName: string | undefined;
  if (name?.[1]) {
    const parts = name[1].trim().split(/\s+/);
    lastName = parts[parts.length - 1];
  }
  return { lastName, dob };
}

const grab = (text: string, re: RegExp): string | undefined => text.match(re)?.[1];

function call(name: string, args: Record<string, unknown>): ToolCall {
  return { id: 'call_1', name, arguments: args };
}

export class MockBrain implements AgentBrain {
  readonly name = 'mock';

  async respond(messages: BrainMessage[], _tools: ToolSchema[]): Promise<BrainTurn> {
    const text = lastUserMessage(messages);
    const t = text.toLowerCase();
    const id = extractIdentity(text);
    const ident = { lastName: id.lastName ?? '', dob: id.dob ?? '' };
    const noTools = (assistantText: string): BrainTurn => ({ assistantText, toolCalls: [] });
    const withTool = (c: ToolCall, assistantText = ''): BrainTurn => ({
      assistantText,
      toolCalls: [c],
    });

    // 1. Refuse injection / jailbreak attempts.
    if (detectInjection(text)) {
      return noTools('I can only help with appointments and practice enquiries.');
    }

    // 2. Red-flag symptoms triage immediately (safety first).
    if (detectRedFlags(text).isRedFlag) {
      return withTool(call('triage_symptoms', { symptoms: text, ...id }));
    }

    // 3. Explicit appointment intents.
    if (/\b(cancel)\b/.test(t)) {
      return withTool(
        call('cancel_appointment', { ...ident, appointmentId: grab(text, /\b(appt-[\w-]+)\b/) }),
      );
    }
    if (/\b(reschedul|rebook|move|change).*(appointment|it|booking)?/.test(t)) {
      return withTool(
        call('reschedule_appointment', {
          ...ident,
          newSlotId: grab(text, /\b(slot[-\w]+|s\d+)\b/) ?? '',
        }),
      );
    }
    if (/\b(confirm|when is my|check my|do i have)\b/.test(t) && /appointment|booking/.test(t)) {
      return withTool(call('confirm_appointment', ident));
    }
    if (/\b(repeat )?prescription|refill|renew.*(medication|inhaler|tablets)\b/.test(t)) {
      const medication = grab(text, /\bfor\s+([a-z][a-z ]+?)(?:[,.]|\s+please|\s+i'?m|$)/i);
      return withTool(
        call('capture_prescription', {
          ...ident,
          medication: (medication ?? '').trim() || 'the requested medication',
        }),
      );
    }
    if (/\b(book|appointment|see (a|the) (doctor|gp|dentist|nurse))\b/.test(t)) {
      const slotId = grab(text, /\b(slot[-\w]+|s\d+)\b/);
      if (slotId) return withTool(call('book_appointment', { ...ident, slotId }));
      const role = /dentist|dental/.test(t) ? 'Dentist' : /nurse/.test(t) ? 'Nurse' : 'GP';
      return withTool(call('list_slots', { role }));
    }

    // 4. FAQ.
    if (
      /\b(open|opening|hours|close|where|address|located|register|registration|services?|phone|contact|number)\b/.test(
        t,
      )
    ) {
      return withTool(call('answer_faq', { question: text }));
    }

    // 5. Non-red-flag symptom talk -> triage (routine/urgent).
    if (SYMPTOM_WORDS.test(t)) {
      return withTool(call('triage_symptoms', { symptoms: text, ...id }));
    }

    // 6. Fallback: ask what they need.
    return noTools(
      'Hello, this is Nightingale. Would you like to book, change or confirm an appointment?',
    );
  }
}

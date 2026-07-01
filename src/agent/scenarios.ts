/**
 * Deterministic scripted call scenarios — the keyless "tier 3" that guarantees
 * the demo always works (ADR-0002). Each scenario is a list of caller turns; the
 * runner drives them through the real agent loop and real tools against D1.
 *
 * `{SLOT}` in a turn is bound to the id of the first slot offered by a preceding
 * list_slots call, so booking flows work without hard-coding generated ids.
 */
import type { Ctx } from '../services/appointments';
import type { AgentBrain, BrainMessage } from './brain';
import { runAgentTurn, type Invocation } from './loop';

export interface Scenario {
  id: string;
  title: string;
  description: string;
  turns: string[];
}

const TOMLIN = 'John Tomlin, date of birth 1979-11-05';

export const SCENARIOS: Scenario[] = [
  {
    id: 'book-gp',
    title: 'Book a GP appointment',
    description: 'A registered patient books the next available GP slot.',
    turns: [
      `Hello, I'd like to book an appointment to see a GP. My name is ${TOMLIN}.`,
      `Great — please book {SLOT}. This is ${TOMLIN}.`,
    ],
  },
  {
    id: 'confirm',
    title: 'Confirm an existing appointment',
    description: 'Book, then read the appointment back to the caller.',
    turns: [
      `I'd like to book a GP appointment. ${TOMLIN}.`,
      `Please book {SLOT}. ${TOMLIN}.`,
      `Can you confirm my upcoming appointment? ${TOMLIN}.`,
    ],
  },
  {
    id: 'cancel',
    title: 'Cancel an appointment',
    description: 'Book, then cancel after identity verification.',
    turns: [
      `I'd like to book a GP appointment. ${TOMLIN}.`,
      `Please book {SLOT}. ${TOMLIN}.`,
      `Actually, I need to cancel my appointment. ${TOMLIN}.`,
    ],
  },
  {
    id: 'faq-hours',
    title: 'Ask about opening hours',
    description: 'A simple contained FAQ call.',
    turns: ['What time do you open on Saturdays?'],
  },
  {
    id: 'prescription',
    title: 'Request a repeat prescription',
    description: 'Captured and routed to the pharmacist — never fulfilled.',
    turns: [`I'd like a repeat prescription for salbutamol please. ${TOMLIN}.`],
  },
  {
    id: 'triage-emergency',
    title: 'Urgent triage (red flag)',
    description: 'Red-flag symptoms are routed to 999 with no medical advice.',
    turns: ['I have severe chest pain and I feel really breathless.'],
  },
];

export interface ScenarioRun {
  transcript: Array<{ role: 'patient' | 'agent'; text: string }>;
  invocations: Invocation[];
}

export async function runScenario(opts: {
  brain: AgentBrain;
  ctx: Ctx;
  callId: string;
  systemPrompt: string;
  scenario: Scenario;
}): Promise<ScenarioRun> {
  let history: BrainMessage[] = [];
  let lastSlotId: string | undefined;
  const transcript: ScenarioRun['transcript'] = [];
  const invocations: Invocation[] = [];

  for (const raw of opts.scenario.turns) {
    const userText = raw.replace('{SLOT}', lastSlotId ?? 'the first available slot');
    const res = await runAgentTurn({
      brain: opts.brain,
      ctx: opts.ctx,
      callId: opts.callId,
      systemPrompt: opts.systemPrompt,
      history,
      userText,
    });
    history = res.messages;
    transcript.push({ role: 'patient', text: userText });
    transcript.push({ role: 'agent', text: res.assistantText });
    for (const inv of res.invocations) {
      invocations.push(inv);
      if (inv.name === 'list_slots' && inv.result.ok) {
        const slots = inv.result.slots as Array<{ slotId: string }> | undefined;
        if (slots?.length) lastSlotId = slots[0]!.slotId;
      }
    }
  }
  return { transcript, invocations };
}

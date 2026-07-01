/**
 * Tool schemas the brain can call — authored once in OpenAI function-calling
 * shape and reused by the GPT brain, the ElevenLabs agent config, and the eval
 * harness. Identity is flattened to lastName/dob for easy function-calling.
 */
import type { ToolSchema } from './brain';

const identityProps = {
  lastName: { type: 'string', description: "The caller's last name / surname." },
  dob: { type: 'string', description: 'Date of birth, ISO format YYYY-MM-DD.' },
};

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'list_slots',
    description: 'List available appointment slots. Use before booking to offer times.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['GP', 'Dentist', 'Nurse'], description: 'Clinician type.' },
        limit: { type: 'integer', description: 'Max slots to return (default 5).' },
      },
    },
  },
  {
    name: 'book_appointment',
    description: 'Book a specific available slot for a verified patient.',
    parameters: {
      type: 'object',
      properties: {
        ...identityProps,
        slotId: { type: 'string', description: 'The id of the slot to book.' },
        reason: { type: 'string', description: 'Short, non-clinical reason for the visit.' },
      },
      required: ['lastName', 'dob', 'slotId'],
    },
  },
  {
    name: 'cancel_appointment',
    description: "Cancel the caller's upcoming appointment after verifying identity.",
    parameters: {
      type: 'object',
      properties: {
        ...identityProps,
        appointmentId: { type: 'string', description: 'Optional specific appointment id.' },
      },
      required: ['lastName', 'dob'],
    },
  },
  {
    name: 'reschedule_appointment',
    description: "Move the caller's appointment to a new slot after verifying identity.",
    parameters: {
      type: 'object',
      properties: {
        ...identityProps,
        newSlotId: { type: 'string', description: 'The id of the new slot.' },
        appointmentId: { type: 'string', description: 'Optional specific appointment id.' },
      },
      required: ['lastName', 'dob', 'newSlotId'],
    },
  },
  {
    name: 'confirm_appointment',
    description: "Read back the caller's upcoming appointment(s) after verifying identity.",
    parameters: {
      type: 'object',
      properties: { ...identityProps },
      required: ['lastName', 'dob'],
    },
  },
  {
    name: 'answer_faq',
    description: 'Answer a practice FAQ (hours, location, contact, registration, services).',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: "The caller's question." } },
      required: ['question'],
    },
  },
  {
    name: 'capture_prescription',
    description:
      'Capture a repeat-prescription request and route it to a pharmacist. Never fulfils.',
    parameters: {
      type: 'object',
      properties: {
        ...identityProps,
        medication: { type: 'string', description: 'The medication requested.' },
        notes: { type: 'string', description: 'Optional extra detail.' },
      },
      required: ['lastName', 'dob', 'medication'],
    },
  },
  {
    name: 'triage_symptoms',
    description:
      'Assess urgency of described symptoms and route (999 / urgent callback / routine). Never gives medical advice.',
    parameters: {
      type: 'object',
      properties: {
        symptoms: { type: 'string', description: "The caller's described symptoms." },
        ...identityProps,
      },
      required: ['symptoms'],
    },
  },
];

export const TOOL_NAMES = TOOL_SCHEMAS.map((t) => t.name);

/**
 * Call + event logging. Every payload is redacted (ADR-0007) before it is
 * written, so PII never lands in the transcript, booking log or analytics.
 */
import { redactPayload } from '../domain/redact';

export type EventType = 'turn' | 'tool_call' | 'tool_result' | 'escalation' | 'error';
export type EventRole = 'patient' | 'agent' | 'system';
export type CallChannel = 'voice' | 'gpt-chat' | 'scripted';

export async function startCall(
  db: D1Database,
  args: { id: string; channel: CallChannel; callerRef?: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO call_logs (id, channel, caller_ref) VALUES (?, ?, ?)')
    .bind(args.id, args.channel, args.callerRef ?? null)
    .run();
}

export async function endCall(
  db: D1Database,
  args: { id: string; outcome?: 'contained' | 'escalated' | 'abandoned'; summary?: string },
): Promise<void> {
  await db
    .prepare(
      "UPDATE call_logs SET ended_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), outcome = ?, summary = ? WHERE id = ?",
    )
    .bind(args.outcome ?? null, args.summary ?? null, args.id)
    .run();
}

export async function logEvent(
  db: D1Database,
  args: {
    callId: string;
    type: EventType;
    role?: EventRole;
    tool?: string;
    payload?: unknown;
    latencyMs?: number;
  },
): Promise<void> {
  const payloadJson =
    args.payload === undefined ? null : JSON.stringify(redactPayload(args.payload));
  await db
    .prepare(
      'INSERT INTO events (call_id, type, role, tool, payload_json, latency_ms) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      args.callId,
      args.type,
      args.role ?? null,
      args.tool ?? null,
      payloadJson,
      args.latencyMs ?? null,
    )
    .run();
}

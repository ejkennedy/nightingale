/**
 * Read-model queries for the demo dashboard. All patient-facing output is
 * minimised (first name + last initial only) — the dashboard is public, so it
 * never shows full names or contact details (ADR-0007).
 */

export interface DashboardStats {
  totalCalls: number;
  contained: number;
  escalated: number;
  bookings: number;
  openEscalations: number;
  containmentRate: number; // 0..1
}

export async function getStats(db: D1Database): Promise<DashboardStats> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM call_logs) AS totalCalls,
         (SELECT COUNT(*) FROM call_logs WHERE outcome = 'contained') AS contained,
         (SELECT COUNT(*) FROM call_logs WHERE outcome = 'escalated') AS escalated,
         (SELECT COUNT(*) FROM appointments WHERE status = 'booked') AS bookings,
         (SELECT COUNT(*) FROM escalations WHERE status = 'open') AS openEscalations`,
    )
    .first<Omit<DashboardStats, 'containmentRate'>>();
  const s = row ?? { totalCalls: 0, contained: 0, escalated: 0, bookings: 0, openEscalations: 0 };
  const resolved = s.contained + s.escalated;
  return { ...s, containmentRate: resolved ? s.contained / resolved : 0 };
}

export interface CallSummary {
  id: string;
  channel: string;
  startedAt: string;
  outcome: string | null;
}

export async function getRecentCalls(db: D1Database, limit = 15): Promise<CallSummary[]> {
  const { results } = await db
    .prepare(
      'SELECT id, channel, started_at AS startedAt, outcome FROM call_logs ORDER BY started_at DESC, rowid DESC LIMIT ?',
    )
    .bind(limit)
    .all<CallSummary>();
  return results;
}

export interface TranscriptEntry {
  ts: string;
  type: string;
  role: string | null;
  tool: string | null;
  payload: unknown;
  latencyMs: number | null;
}

export async function getTranscript(db: D1Database, callId: string): Promise<TranscriptEntry[]> {
  const { results } = await db
    .prepare(
      'SELECT ts, type, role, tool, payload_json, latency_ms AS latencyMs FROM events WHERE call_id = ? ORDER BY id ASC',
    )
    .bind(callId)
    .all<{
      ts: string;
      type: string;
      role: string | null;
      tool: string | null;
      payload_json: string | null;
      latencyMs: number | null;
    }>();
  return results.map((r) => ({
    ts: r.ts,
    type: r.type,
    role: r.role,
    tool: r.tool,
    latencyMs: r.latencyMs,
    payload: r.payload_json ? safeParse(r.payload_json) : null,
  }));
}

export interface BookingLogEntry {
  appointmentId: string;
  patient: string; // minimised: "John T."
  practitioner: string;
  startsAt: string;
  status: string;
  createdAt: string;
}

export async function getBookingLog(db: D1Database, limit = 20): Promise<BookingLogEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id AS appointmentId, pat.first_name AS firstName, pat.last_name AS lastName,
              pr.name AS practitioner, s.starts_at AS startsAt, a.status AS status, a.created_at AS createdAt
       FROM appointments a
       JOIN patients pat ON pat.id = a.patient_id
       JOIN slots s ON s.id = a.slot_id
       JOIN practitioners pr ON pr.id = s.practitioner_id
       ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{
      appointmentId: string;
      firstName: string;
      lastName: string;
      practitioner: string;
      startsAt: string;
      status: string;
      createdAt: string;
    }>();
  return results.map((r) => ({
    appointmentId: r.appointmentId,
    patient: `${r.firstName} ${r.lastName.charAt(0)}.`,
    practitioner: r.practitioner,
    startsAt: r.startsAt,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

export interface ToolLatency {
  tool: string;
  count: number;
  p50: number;
  p95: number;
}

export async function getLatencyStats(db: D1Database): Promise<ToolLatency[]> {
  const { results } = await db
    .prepare(
      "SELECT tool, latency_ms AS latencyMs FROM events WHERE type = 'tool_result' AND latency_ms IS NOT NULL",
    )
    .all<{ tool: string; latencyMs: number }>();

  const byTool = new Map<string, number[]>();
  for (const r of results) {
    if (!byTool.has(r.tool)) byTool.set(r.tool, []);
    byTool.get(r.tool)!.push(r.latencyMs);
  }
  return [...byTool.entries()]
    .map(([tool, xs]) => {
      xs.sort((a, b) => a - b);
      return { tool, count: xs.length, p50: percentile(xs, 0.5), p95: percentile(xs, 0.95) };
    })
    .sort((a, b) => b.count - a.count);
}

export interface EscalationEntry {
  id: string;
  type: string;
  urgency: string | null;
  summary: string | null;
  createdAt: string;
}

export async function getEscalations(db: D1Database, limit = 15): Promise<EscalationEntry[]> {
  const { results } = await db
    .prepare(
      'SELECT id, type, urgency, summary, created_at AS createdAt FROM escalations ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
    .bind(limit)
    .all<EscalationEntry>();
  return results;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

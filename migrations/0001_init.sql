-- Nightingale initial schema. D1 is the source of truth (ADR-0003).
-- Times are stored as ISO-8601 UTC strings ('...Z') and rendered in the
-- practice timezone (Europe/London) at the edges.

PRAGMA foreign_keys = ON;

-- Clinicians a patient can be booked with.
CREATE TABLE practitioners (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('GP', 'Dentist', 'Nurse')),
  specialty  TEXT
);

-- Registered (synthetic) patients. No real PII ever (SECURITY.md).
CREATE TABLE patients (
  id          TEXT PRIMARY KEY,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  dob         TEXT NOT NULL,               -- 'YYYY-MM-DD'
  phone       TEXT NOT NULL,
  email       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- Identity is verified on (last_name, dob) — index the lookup.
CREATE INDEX idx_patients_identity ON patients (last_name, dob);

-- Bookable appointment slots.
CREATE TABLE slots (
  id                TEXT PRIMARY KEY,
  practitioner_id   TEXT NOT NULL REFERENCES practitioners (id),
  starts_at         TEXT NOT NULL,          -- ISO-8601 UTC
  duration_minutes  INTEGER NOT NULL DEFAULT 10,
  status            TEXT NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available', 'booked', 'blocked'))
);
CREATE INDEX idx_slots_lookup ON slots (status, starts_at);
CREATE INDEX idx_slots_practitioner ON slots (practitioner_id, starts_at);

-- A booking links a patient to a slot. One live appointment per slot.
CREATE TABLE appointments (
  id            TEXT PRIMARY KEY,
  slot_id       TEXT NOT NULL REFERENCES slots (id),
  patient_id    TEXT NOT NULL REFERENCES patients (id),
  reason        TEXT,                        -- short, non-clinical
  status        TEXT NOT NULL DEFAULT 'booked'
                  CHECK (status IN ('booked', 'cancelled', 'completed')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  cancelled_at  TEXT
);
-- Only one non-cancelled appointment may hold a given slot.
CREATE UNIQUE INDEX idx_appointments_live_slot
  ON appointments (slot_id) WHERE status != 'cancelled';
CREATE INDEX idx_appointments_patient ON appointments (patient_id, status);

-- One row per call/session.
CREATE TABLE call_logs (
  id          TEXT PRIMARY KEY,
  channel     TEXT NOT NULL CHECK (channel IN ('voice', 'gpt-chat', 'scripted')),
  caller_ref  TEXT,                          -- redacted phone / session id
  started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ended_at    TEXT,
  outcome     TEXT CHECK (outcome IN ('contained', 'escalated', 'abandoned')),
  summary     TEXT
);

-- Append-only timeline of turns, tool calls and results (redacted). Feeds the
-- dashboard transcript, booking log and latency readout.
CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id      TEXT REFERENCES call_logs (id),
  ts           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  type         TEXT NOT NULL
                 CHECK (type IN ('turn', 'tool_call', 'tool_result', 'escalation', 'error')),
  role         TEXT CHECK (role IN ('patient', 'agent', 'system')),
  tool         TEXT,
  payload_json TEXT,                          -- redacted JSON
  latency_ms   INTEGER
);
CREATE INDEX idx_events_call ON events (call_id, id);
CREATE INDEX idx_events_tool ON events (tool, ts);

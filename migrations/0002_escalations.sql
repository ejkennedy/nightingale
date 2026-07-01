-- Escalations: captured requests that Nightingale routes to a human rather than
-- fulfilling itself (repeat prescriptions, urgent triage). ADR-0006/0007.

CREATE TABLE escalations (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('prescription', 'triage', 'other')),
  patient_id  TEXT REFERENCES patients (id),
  summary     TEXT,                          -- redacted, non-clinical summary
  urgency     TEXT CHECK (urgency IN ('routine', 'urgent', 'emergency')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_escalations_status ON escalations (status, created_at);

-- Confirmation emails. The rendered HTML is always stored (so the dashboard can
-- show it with no keys); `sent` records whether a real Resend send happened.
-- Recipient is stored redacted (ADR-0007) — the full address is used only
-- transiently to send.

CREATE TABLE emails (
  id                  TEXT PRIMARY KEY,
  recipient_redacted  TEXT NOT NULL,
  subject             TEXT NOT NULL,
  html                TEXT NOT NULL,
  sent                INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_emails_created ON emails (created_at);

/** Persistence for rendered confirmation emails (dashboard preview + audit). */

export async function insertEmail(
  db: D1Database,
  args: { id: string; recipientRedacted: string; subject: string; html: string; sent: boolean },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO emails (id, recipient_redacted, subject, html, sent) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(args.id, args.recipientRedacted, args.subject, args.html, args.sent ? 1 : 0)
    .run();
}

export interface EmailRecord {
  id: string;
  recipientRedacted: string;
  subject: string;
  html: string;
  sent: boolean;
  createdAt: string;
}

export async function getRecentEmails(db: D1Database, limit = 5): Promise<EmailRecord[]> {
  const { results } = await db
    .prepare(
      'SELECT id, recipient_redacted AS recipientRedacted, subject, html, sent, created_at AS createdAt FROM emails ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
    .bind(limit)
    .all<{
      id: string;
      recipientRedacted: string;
      subject: string;
      html: string;
      sent: number;
      createdAt: string;
    }>();
  return results.map((r) => ({ ...r, sent: r.sent === 1 }));
}

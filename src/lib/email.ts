/**
 * Confirmation emails. The HTML is ALWAYS rendered (and stored for the dashboard
 * to show), and a real email is sent via Resend only when a key + sender are
 * configured — the same layered resilience as the rest of the system (ADR-0002).
 */
import type { Env } from '../env';

export interface ConfirmationDetails {
  agentName: string;
  practiceName: string;
  patientFirstName: string;
  when: string;
  practitioner: string;
}

export function renderConfirmationEmail(d: ConfirmationDetails): { subject: string; html: string } {
  const subject = `Appointment confirmed — ${d.practiceName}`;
  const html = `<!doctype html>
<html>
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; color: #1a2b4a; background:#f4f7fb; padding:24px;">
    <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0;">
      <p style="font-size:18px;font-weight:700;margin:0 0 4px;">🕊️ ${d.practiceName}</p>
      <p style="color:#5b6b85;margin:0 0 20px;">Appointment confirmation</p>
      <p>Hello ${d.patientFirstName},</p>
      <p>Your appointment is confirmed:</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;">
        <tr><td style="padding:8px 0;color:#5b6b85;">When</td><td style="padding:8px 0;font-weight:600;">${d.when}</td></tr>
        <tr><td style="padding:8px 0;color:#5b6b85;">With</td><td style="padding:8px 0;font-weight:600;">${d.practitioner}</td></tr>
      </table>
      <p style="color:#5b6b85;font-size:13px;margin-top:20px;">Need to change it? Just call us back and ${d.agentName} can help. Please arrive 5 minutes early.</p>
      <p style="color:#9aa7bd;font-size:12px;margin-top:16px;">This is a demonstration message. ${d.practiceName} is not a real practice.</p>
    </div>
  </body>
</html>`;
  return { subject, html };
}

/** Send via Resend. Returns true if a real send happened, false if not configured. */
export async function sendViaResend(
  env: Env,
  msg: { to: string; subject: string; html: string },
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    }),
  });
  return res.ok;
}

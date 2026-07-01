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
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; color:#1f2d29; background:#f2ede3; padding:24px;">
    <div style="max-width:520px;margin:auto;background:#fbf8f2;border-radius:14px;padding:28px;border:1px solid #e6dfd0;">
      <p style="font-size:18px;font-weight:700;margin:0 0 4px;color:#0f5e54;">🪔 ${d.practiceName}</p>
      <p style="color:#5f665d;margin:0 0 20px;">Appointment confirmation</p>
      <p>Hello ${d.patientFirstName},</p>
      <p>Your appointment is confirmed:</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;">
        <tr><td style="padding:8px 0;color:#5f665d;">When</td><td style="padding:8px 0;font-weight:600;">${d.when}</td></tr>
        <tr><td style="padding:8px 0;color:#5f665d;">With</td><td style="padding:8px 0;font-weight:600;">${d.practitioner}</td></tr>
      </table>
      <p style="color:#5f665d;font-size:13px;margin-top:20px;">Need to change it? Just call us back and ${d.agentName} can help. Please arrive 5 minutes early.</p>
      <p style="color:#9aa39a;font-size:12px;margin-top:16px;">This is a demonstration message. ${d.practiceName} is not a real practice.</p>
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

/**
 * Inbound webhook for ElevenLabs Conversational AI tool calls (tier 1 voice).
 * The real agent calls back here; every request is HMAC-verified against
 * WEBHOOK_HMAC_SECRET before it is allowed to touch the guarded services
 * (ADR-0006, SECURITY.md). The dispatched call goes through the same path as the
 * sim harness, so guardrails apply identically.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { executeToolCall } from '../agent/dispatch';
import { verifySignature } from '../lib/hmac';

export const webhooks = new Hono<{ Bindings: Env }>();

/** POST /webhooks/elevenlabs/tool  { tool, parameters } */
webhooks.post('/elevenlabs/tool', async (c) => {
  const secret = c.env.WEBHOOK_HMAC_SECRET;
  if (!secret) return c.json({ ok: false, error: 'webhook_not_configured' }, 503);

  // Verify the signature over the RAW body before parsing it.
  const raw = await c.req.text();
  const signature = c.req.header('x-elevenlabs-signature') ?? c.req.header('x-signature');
  if (!(await verifySignature(secret, raw, signature))) {
    return c.json({ ok: false, error: 'invalid_signature' }, 401);
  }

  let body: { tool?: string; parameters?: Record<string, unknown> };
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  if (!body.tool) return c.json({ ok: false, error: 'missing_tool' }, 400);

  const result = await executeToolCall(
    { db: c.env.DB, now: new Date(), timeZone: c.env.PRACTICE_TIMEZONE, env: c.env },
    { id: crypto.randomUUID(), name: body.tool, arguments: body.parameters ?? {} },
  );
  return c.json(result);
});

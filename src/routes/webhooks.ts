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
import { timingSafeEqual, verifySignature } from '../lib/hmac';

export const webhooks = new Hono<{ Bindings: Env }>();

/**
 * POST /webhooks/elevenlabs/tool  { tool, parameters }
 *
 * Authenticated by EITHER an HMAC signature over the raw body
 * (`WEBHOOK_HMAC_SECRET`, for signers that support it) OR a matching static
 * bearer token header (`WEBHOOK_TOKEN`, sent as `x-webhook-token`) — the latter
 * is what ElevenLabs webhook tools configure via a request header. If neither
 * secret is set the endpoint reports `webhook_not_configured` (503).
 */
webhooks.post('/elevenlabs/tool', async (c) => {
  const hmacSecret = c.env.WEBHOOK_HMAC_SECRET;
  const staticToken = c.env.WEBHOOK_TOKEN;
  if (!hmacSecret && !staticToken) {
    return c.json({ ok: false, error: 'webhook_not_configured' }, 503);
  }

  // Read the RAW body first (HMAC is verified over the exact bytes).
  const raw = await c.req.text();

  let authed = false;
  if (hmacSecret) {
    const signature = c.req.header('x-elevenlabs-signature') ?? c.req.header('x-signature');
    if (await verifySignature(hmacSecret, raw, signature)) authed = true;
  }
  if (!authed && staticToken) {
    if (timingSafeEqual(c.req.header('x-webhook-token') ?? '', staticToken)) authed = true;
  }
  if (!authed) {
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

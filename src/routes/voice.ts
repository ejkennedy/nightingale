/**
 * Tier-1 voice support endpoints (ElevenLabs Conversational AI).
 *
 * The browser widget talks to ElevenLabs directly; these endpoints exist so a
 * PRIVATE agent can be used without exposing the API key to the client — the
 * Worker mints a short-lived signed URL server-side. Public agents don't need
 * this (the widget takes the agent id alone), so the whole feature is optional
 * and the endpoints report `voice_not_configured` until keys are present.
 */
import { Hono } from 'hono';
import type { Env } from '../env';

export const voice = new Hono<{ Bindings: Env }>();

/**
 * GET /voice/signed-url — mint a signed conversation URL for a private agent.
 * Returns 503 until ELEVENLABS_API_KEY + ELEVENLABS_AGENT_ID are configured, so
 * the no-keys demo degrades cleanly.
 */
voice.get('/signed-url', async (c) => {
  const apiKey = c.env.ELEVENLABS_API_KEY;
  const agentId = c.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return c.json({ ok: false, error: 'voice_not_configured' }, 503);
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { 'xi-api-key': apiKey } },
  );
  if (!res.ok) return c.json({ ok: false, error: 'signed_url_failed', status: res.status }, 502);

  const data = (await res.json().catch(() => ({}))) as { signed_url?: string };
  if (!data.signed_url) return c.json({ ok: false, error: 'signed_url_missing' }, 502);
  return c.json({ ok: true, signedUrl: data.signed_url });
});

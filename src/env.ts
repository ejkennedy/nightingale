/**
 * Runtime bindings available to the Worker.
 *
 * Secrets are optional at the type level on purpose: Nightingale is designed to
 * degrade gracefully. With no secrets set it still serves the dashboard and runs
 * deterministic scripted call scenarios (resilience "tier 3"). As each secret is
 * added, a higher tier unlocks (GPT chat, real voice, real email).
 */
export interface Env {
  // --- Bindings ---
  DB: D1Database;

  // --- Non-secret vars (wrangler.toml [vars]) ---
  PRACTICE_NAME: string;
  PRACTICE_TIMEZONE: string;
  AGENT_NAME: string;
  ENVIRONMENT: string;

  // --- Secrets (optional; unlock higher resilience tiers) ---
  OPENAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_AGENT_ID?: string;
  WEBHOOK_HMAC_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  ADMIN_TOKEN?: string;
}

/** Which resilience tier is currently active, given the configured secrets. */
export type ResilienceTier = 'voice' | 'gpt' | 'scripted';

export function activeTier(env: Env): ResilienceTier {
  if (env.ELEVENLABS_API_KEY && env.ELEVENLABS_AGENT_ID) return 'voice';
  if (env.OPENAI_API_KEY) return 'gpt';
  return 'scripted';
}

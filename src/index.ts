import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, ResilienceTier } from './env';
import { activeTier } from './env';
import { tools } from './routes/tools';
import { sim } from './routes/sim';
import { webhooks } from './routes/webhooks';
import { voice } from './routes/voice';
import { dashboard } from './routes/dashboard';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', secureHeaders());

// Orchestration tool contract (book / cancel / reschedule / slots).
app.route('/tools', tools);
// Simulated call harness (scripted scenarios + free-text chat).
app.route('/sim', sim);
// HMAC-verified webhook for the real ElevenLabs agent.
app.route('/webhooks', webhooks);
// Tier-1 voice support (signed URL for private ElevenLabs agents).
app.route('/voice', voice);
// Demo dashboard (page at / and HTMX fragments at /ui/*).
app.route('/', dashboard);

/**
 * Liveness/readiness probe. Reports which resilience tier is active so the
 * dashboard and CI can assert the Worker is up without needing any API keys.
 */
app.get('/health', (c) => {
  const tier: ResilienceTier = activeTier(c.env);
  return c.json({
    status: 'ok',
    service: 'nightingale',
    agent: c.env.AGENT_NAME,
    practice: c.env.PRACTICE_NAME,
    environment: c.env.ENVIRONMENT,
    tier,
    time: new Date().toISOString(),
  });
});

// Durable Object class must be exported from the entry module.
export { RateLimiter } from './durable/rate-limiter';

export default app;

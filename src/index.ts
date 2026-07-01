import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, ResilienceTier } from './env';
import { activeTier } from './env';
import { tools } from './routes/tools';
import { sim } from './routes/sim';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', secureHeaders());

// Orchestration tool contract (book / cancel / reschedule / slots).
app.route('/tools', tools);
// Simulated call harness (scripted scenarios + free-text chat).
app.route('/sim', sim);

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

// Landing page — the full HTMX dashboard is built in Sprint 3.
app.get('/', (c) => {
  return c.html(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${c.env.AGENT_NAME} — AI receptionist</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 40rem;
             margin: 4rem auto; padding: 0 1rem; color: #1a2b4a; line-height: 1.6; }
      code { background: #eef2ff; padding: 0.1rem 0.35rem; border-radius: 4px; }
      .tier { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px;
              background: #dcfce7; color: #166534; font-size: 0.8rem; font-weight: 600; }
    </style>
  </head>
  <body>
    <h1>🕊️ ${c.env.AGENT_NAME}</h1>
    <p>An AI receptionist for UK GP &amp; dental practices, on call for
       <strong>${c.env.PRACTICE_NAME}</strong>.</p>
    <p>Active resilience tier: <span class="tier">${activeTier(c.env)}</span></p>
    <p>The live demo dashboard is under construction — see
       <code>GET /health</code> for status. Follow progress on
       <a href="https://github.com/ejkennedy/nightingale">GitHub</a>.</p>
  </body>
</html>`,
  );
});

export default app;

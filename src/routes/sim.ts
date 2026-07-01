/**
 * Simulated call harness — the fallback front-ends that hit the exact same tool
 * contract as real voice (ADR-0002):
 *   - POST /sim/scenario  : deterministic scripted replay (tier 3, no keys)
 *   - POST /sim/message   : free-text chat driven by the active brain (tier 2)
 * Both persist a redacted transcript + tool latencies for the dashboard.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { activeTier, type Env } from '../env';
import { MockBrain } from '../agent/mock-brain';
import { selectBrain } from '../agent/factory';
import { loadSystemPrompt } from '../agent/prompt';
import { runAgentTurn } from '../agent/loop';
import { runScenario, SCENARIOS } from '../agent/scenarios';
import type { BrainMessage } from '../agent/brain';
import { endCall, logEvent, startCall } from '../db/logging';

export const sim = new Hono<{ Bindings: Env }>();

const ctxFrom = (env: Env) => ({ db: env.DB, now: new Date(), timeZone: env.PRACTICE_TIMEZONE });

/** List the available scripted scenarios (for the dashboard buttons). */
sim.get('/scenarios', (c) =>
  c.json({
    scenarios: SCENARIOS.map(({ id, title, description }) => ({ id, title, description })),
  }),
);

/** Run a scripted scenario deterministically against real D1 (always works). */
sim.post('/scenario', async (c) => {
  const { id } = (await c.req.json().catch(() => ({}))) as { id?: string };
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) return c.json({ ok: false, error: 'unknown_scenario' }, 404);

  const callId = crypto.randomUUID();
  await startCall(c.env.DB, { id: callId, channel: 'scripted', callerRef: `scenario:${id}` });
  const { text: systemPrompt } = await loadSystemPrompt(c.env);
  const run = await runScenario({
    brain: new MockBrain(), // scripted tier is always deterministic
    ctx: ctxFrom(c.env),
    callId,
    systemPrompt,
    scenario,
  });

  const escalated = run.invocations.some(
    (i) => i.name === 'triage_symptoms' || i.name === 'capture_prescription',
  );
  await endCall(c.env.DB, { id: callId, outcome: escalated ? 'escalated' : 'contained' });
  return c.json({ ok: true, callId, tier: 'scripted', ...run });
});

const messageBody = z.object({
  callId: z.string().optional(),
  history: z.array(z.any()).optional(),
  message: z.string().min(1).max(500),
});

/**
 * One free-text turn. The client holds the transcript and passes `history`
 * back each turn (stateless server). Uses the real brain when an OpenAI key is
 * set, else the deterministic MockBrain.
 */
sim.post('/message', async (c) => {
  const parsed = messageBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_input' }, 400);

  const callId = parsed.data.callId ?? crypto.randomUUID();
  const channel = c.env.OPENAI_API_KEY ? 'gpt-chat' : 'scripted';
  if (!parsed.data.callId) await startCall(c.env.DB, { id: callId, channel });

  const { text: systemPrompt } = await loadSystemPrompt(c.env);
  let res;
  try {
    res = await runAgentTurn({
      brain: selectBrain(c.env),
      ctx: ctxFrom(c.env),
      callId,
      systemPrompt,
      history: (parsed.data.history as BrainMessage[]) ?? [],
      userText: parsed.data.message,
    });
  } catch (err) {
    await logEvent(c.env.DB, { callId, type: 'error', payload: { message: String(err) } });
    return c.json({ ok: false, error: 'brain_error', callId }, 502);
  }

  return c.json({
    ok: true,
    callId,
    tier: activeTier(c.env),
    assistantText: res.assistantText,
    invocations: res.invocations,
    history: res.messages,
  });
});

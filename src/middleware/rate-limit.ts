/**
 * Hono middleware that rate-limits by caller IP via the RateLimiter Durable
 * Object. Applied to the public sim write endpoints so a stranger with the demo
 * link can explore but not spam (ADR-0006).
 */
import type { Context, Next } from 'hono';
import type { Env } from '../env';

export function rateLimit(opts: { limit?: number; windowMs?: number } = {}) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // Skip the Durable Object hop under test (the pinned pool can't isolate DO
    // storage); the window algorithm is unit-tested directly instead.
    if (c.env.ENVIRONMENT === 'test' || !c.env.RATE_LIMITER) return next();

    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'anonymous';
    const limit = opts.limit ?? Number(c.env.SIM_RATE_LIMIT ?? '20');
    const windowMs = opts.windowMs ?? 60_000;

    const stub = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(ip));
    const res = await stub.fetch('https://rate-limiter/check', {
      method: 'POST',
      body: JSON.stringify({ limit, windowMs }),
    });

    if (res.status === 429) {
      return c.json(
        { ok: false, error: 'rate_limited', message: 'Too many requests — slow down.' },
        429,
      );
    }
    await next();
  };
}

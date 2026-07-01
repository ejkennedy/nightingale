/**
 * Fixed-window rate limiter as a Durable Object (ADR-0006). One instance per
 * caller key (IP), so its single-threaded execution makes the increment atomic —
 * no races, no external store. Protects the public sim write endpoints from
 * abuse without a login wall.
 */
import type { Env } from '../env';

export interface WindowState {
  windowStart: number;
  count: number;
}

export interface WindowDecision {
  state: WindowState;
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

/**
 * Pure fixed-window evaluation — the actual limiting algorithm, unit-tested
 * without touching Durable Object storage (which the pinned test pool can't
 * isolate). The DO is just a stateful wrapper around this.
 */
export function evaluateWindow(
  prev: WindowState | undefined,
  now: number,
  limit: number,
  windowMs: number,
): WindowDecision {
  const win: WindowState = prev ? { ...prev } : { windowStart: now, count: 0 };
  if (now - win.windowStart >= windowMs) {
    win.windowStart = now;
    win.count = 0;
  }
  win.count += 1;
  return {
    state: win,
    allowed: win.count <= limit,
    remaining: Math.max(0, limit - win.count),
    resetInMs: win.windowStart + windowMs - now,
  };
}

export class RateLimiter implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    _env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const { limit = 20, windowMs = 60_000 } = (await request.json().catch(() => ({}))) as {
      limit?: number;
      windowMs?: number;
    };

    const prev = await this.state.storage.get<WindowState>('w');
    const d = evaluateWindow(prev, Date.now(), limit, windowMs);
    await this.state.storage.put('w', d.state);

    return Response.json(
      { allowed: d.allowed, remaining: d.remaining, resetInMs: d.resetInMs },
      { status: d.allowed ? 200 : 429 },
    );
  }
}

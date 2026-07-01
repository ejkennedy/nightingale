import { describe, expect, it } from 'vitest';
import { evaluateWindow, type WindowState } from '../../src/durable/rate-limiter';

/** Unit tests for the fixed-window limiting algorithm (the DO wraps this). */

describe('evaluateWindow', () => {
  it('allows the first request and counts down remaining', () => {
    const d = evaluateWindow(undefined, 1000, 3, 60_000);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(2);
  });

  it('permits exactly `limit` requests then blocks', () => {
    let state: WindowState | undefined;
    const results = [];
    for (let i = 0; i < 5; i++) {
      const d = evaluateWindow(state, 1000, 3, 60_000);
      state = d.state;
      results.push(d.allowed);
    }
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('resets the counter once the window elapses', () => {
    const first = evaluateWindow(undefined, 1000, 2, 60_000);
    const second = evaluateWindow(first.state, 1500, 2, 60_000);
    expect(second.allowed).toBe(true);
    // Advance beyond the window: counter resets, request allowed again.
    const later = evaluateWindow(second.state, 1000 + 61_000, 2, 60_000);
    expect(later.allowed).toBe(true);
    expect(later.remaining).toBe(1);
  });
});

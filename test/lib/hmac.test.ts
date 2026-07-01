import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, timingSafeEqual, verifySignature } from '../../src/lib/hmac';

describe('hmacSha256Hex', () => {
  it('is deterministic and 64 hex chars', async () => {
    const a = await hmacSha256Hex('secret', 'payload');
    const b = await hmacSha256Hex('secret', 'payload');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes with the secret or the message', async () => {
    const base = await hmacSha256Hex('secret', 'payload');
    expect(await hmacSha256Hex('other', 'payload')).not.toBe(base);
    expect(await hmacSha256Hex('secret', 'payload2')).not.toBe(base);
  });
});

describe('timingSafeEqual', () => {
  it('is true only for identical strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('verifySignature', () => {
  it('accepts a correct signature (with or without sha256= prefix)', async () => {
    const sig = await hmacSha256Hex('secret', 'body');
    expect(await verifySignature('secret', 'body', sig)).toBe(true);
    expect(await verifySignature('secret', 'body', `sha256=${sig.toUpperCase()}`)).toBe(true);
  });

  it('rejects a wrong or missing signature', async () => {
    expect(await verifySignature('secret', 'body', 'deadbeef')).toBe(false);
    expect(await verifySignature('secret', 'body', null)).toBe(false);
  });
});

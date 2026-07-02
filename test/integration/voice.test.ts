import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

/** The Tier-1 voice endpoints must degrade cleanly with no ElevenLabs keys set. */
describe('GET /voice/signed-url', () => {
  it('reports voice_not_configured (503) when unconfigured', async () => {
    const res = await SELF.fetch('https://nightingale.test/voice/signed-url');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('voice_not_configured');
  });
});

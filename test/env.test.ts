import { describe, expect, it } from 'vitest';
import { activeTier, type Env } from '../src/env';

/** Minimal Env factory — only the fields activeTier() reads need to be real. */
function envWith(secrets: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    RATE_LIMITER: {} as DurableObjectNamespace,
    PRACTICE_NAME: 'Test Practice',
    PRACTICE_TIMEZONE: 'Europe/London',
    AGENT_NAME: 'Nightingale',
    ENVIRONMENT: 'test',
    ...secrets,
  };
}

describe('activeTier — resilience degradation', () => {
  it('falls back to scripted replay when no secrets are set', () => {
    expect(activeTier(envWith())).toBe('scripted');
  });

  it('unlocks the GPT chat tier when only an OpenAI key is present', () => {
    expect(activeTier(envWith({ OPENAI_API_KEY: 'sk-test' }))).toBe('gpt');
  });

  it('prefers the voice tier when ElevenLabs is fully configured', () => {
    expect(
      activeTier(
        envWith({
          OPENAI_API_KEY: 'sk-test',
          ELEVENLABS_API_KEY: 'el-test',
          ELEVENLABS_AGENT_ID: 'agent-123',
        }),
      ),
    ).toBe('voice');
  });

  it('does not claim the voice tier if the ElevenLabs agent id is missing', () => {
    expect(activeTier(envWith({ ELEVENLABS_API_KEY: 'el-test' }))).toBe('scripted');
  });
});

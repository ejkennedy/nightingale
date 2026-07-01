/** Choose the brain based on configured secrets (ADR-0002 resilience tiers). */
import type { Env } from '../env';
import type { AgentBrain } from './brain';
import { MockBrain } from './mock-brain';
import { OpenAIBrain } from './openai-brain';

export function selectBrain(env: Env, model = 'gpt-4o-mini'): AgentBrain {
  if (env.OPENAI_API_KEY) return new OpenAIBrain(env.OPENAI_API_KEY, model);
  return new MockBrain();
}

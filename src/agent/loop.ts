/**
 * The agent turn loop: take a user utterance, let the brain reason and call
 * tools (possibly several rounds), execute each through the guarded services,
 * and return the assistant's reply. Works identically for MockBrain and
 * OpenAIBrain, and logs a redacted transcript + tool latencies.
 */
import type { Ctx } from '../services/appointments';
import { logEvent } from '../db/logging';
import type { AgentBrain, BrainMessage } from './brain';
import { executeToolCall, type ToolExecResult } from './dispatch';
import { TOOL_SCHEMAS } from './tools';

export interface Invocation {
  name: string;
  args: Record<string, unknown>;
  result: ToolExecResult;
  latencyMs: number;
}

export interface TurnResult {
  assistantText: string;
  invocations: Invocation[];
  messages: BrainMessage[];
}

const MAX_TOOL_ROUNDS = 6;

export async function runAgentTurn(opts: {
  brain: AgentBrain;
  ctx: Ctx;
  callId: string;
  systemPrompt: string;
  history: BrainMessage[];
  userText: string;
}): Promise<TurnResult> {
  const { brain, ctx, callId, systemPrompt, history, userText } = opts;
  const messages: BrainMessage[] = [...history];
  if (!messages.some((m) => m.role === 'system')) {
    messages.unshift({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userText });
  await logEvent(ctx.db, { callId, type: 'turn', role: 'patient', payload: { text: userText } });

  const invocations: Invocation[] = [];
  let assistantText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await brain.respond(messages, TOOL_SCHEMAS);

    if (turn.toolCalls.length === 0) {
      assistantText = turn.assistantText || 'Is there anything else I can help with?';
      messages.push({ role: 'assistant', content: assistantText });
      await logEvent(ctx.db, {
        callId,
        type: 'turn',
        role: 'agent',
        payload: { text: assistantText },
      });
      return { assistantText, invocations, messages };
    }

    messages.push({ role: 'assistant', content: turn.assistantText, toolCalls: turn.toolCalls });
    for (const tc of turn.toolCalls) {
      await logEvent(ctx.db, { callId, type: 'tool_call', tool: tc.name, payload: tc.arguments });
      const start = Date.now();
      const result = await executeToolCall(ctx, tc);
      const latencyMs = Date.now() - start;
      await logEvent(ctx.db, {
        callId,
        type: 'tool_result',
        tool: tc.name,
        payload: result,
        latencyMs,
      });
      invocations.push({ name: tc.name, args: tc.arguments, result, latencyMs });
      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        toolCallId: tc.id,
        name: tc.name,
      });
    }
  }

  // Safety valve: the brain kept calling tools without concluding.
  assistantText = 'Let me pass you to a member of the reception team who can help further.';
  messages.push({ role: 'assistant', content: assistantText });
  await logEvent(ctx.db, { callId, type: 'turn', role: 'agent', payload: { text: assistantText } });
  return { assistantText, invocations, messages };
}

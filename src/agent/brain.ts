/**
 * The agent's reasoning layer, behind one swappable interface (ADR-0004).
 *
 * Two implementations share this contract:
 *  - OpenAIBrain  — real GPT function-calling (tiers 1 & 2)
 *  - MockBrain    — deterministic, key-free (CI + scripted tier 3 + evals)
 *
 * The guardrails do NOT live here — they are enforced in the services, so they
 * hold whichever brain is in use (ADR-0007).
 */

/** An OpenAI-style function/tool definition, shared with ElevenLabs. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface BrainMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[]; // assistant turns that call tools
  toolCallId?: string; // role: 'tool' — which call this answers
  name?: string; // role: 'tool' — the tool name
}

export interface BrainTurn {
  assistantText: string;
  toolCalls: ToolCall[];
}

export interface AgentBrain {
  readonly name: string;
  respond(messages: BrainMessage[], tools: ToolSchema[]): Promise<BrainTurn>;
}

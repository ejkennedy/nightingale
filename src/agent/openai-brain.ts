/**
 * Real GPT reasoning via a thin fetch client (no SDK — keeps the Worker light
 * and the API contract explicit). Implements the same AgentBrain interface as
 * MockBrain, so the sim harness and evals are brain-agnostic (ADR-0004).
 */
import type { AgentBrain, BrainMessage, BrainTurn, ToolCall, ToolSchema } from './brain';

interface OpenAIToolCall {
  id: string;
  function: { name: string; arguments: string };
}
interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export class OpenAIBrain implements AgentBrain {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly model = 'gpt-4o-mini',
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}

  async respond(messages: BrainMessage[], tools: ToolSchema[]): Promise<BrainTurn> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: messages.map(toOpenAIMessage),
        tools: tools.map((t) => ({ type: 'function', function: t })),
        tool_choice: 'auto',
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: OpenAIMessage }>;
    };
    const msg = data.choices[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: safeParse(tc.function.arguments),
    }));
    return { assistantText: msg?.content ?? '', toolCalls };
  }
}

function toOpenAIMessage(m: BrainMessage): OpenAIMessage {
  if (m.role === 'tool') {
    return { role: 'tool', content: m.content, tool_call_id: m.toolCallId, name: m.name };
  }
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })) as OpenAIToolCall[],
    };
  }
  return { role: m.role, content: m.content };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

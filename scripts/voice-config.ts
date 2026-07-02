/**
 * Build the ElevenLabs Conversational AI agent config from the SAME system
 * prompt and tool schemas the code already uses — so the voice agent can never
 * drift from the GPT/scripted tiers or the guarded services.
 *
 *   bun run voice:config     # write voice/agent-config.json (reference/import)
 *   bun run voice:provision  # create the agent via the ElevenLabs API
 *
 * Each function tool maps to the single dispatch webhook: the tool name is baked
 * into the request body and the LLM-extracted arguments ride under `parameters`,
 * exactly as src/routes/webhooks.ts expects.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SYSTEM_PROMPT } from '../src/agent/prompt';
import { TOOL_SCHEMAS } from '../src/agent/tools';

export interface BuildOpts {
  practiceName: string;
  agentName: string;
  /** Public Worker origin, e.g. https://nightingale.<subdomain>.workers.dev */
  workerUrl: string;
  /** Static token the agent sends as `x-webhook-token` (matches WEBHOOK_TOKEN). */
  webhookToken?: string;
}

function toWebhookTool(t: (typeof TOOL_SCHEMAS)[number], o: BuildOpts) {
  return {
    type: 'webhook',
    name: t.name,
    description: t.description,
    api_schema: {
      url: `${o.workerUrl}/webhooks/elevenlabs/tool`,
      method: 'POST',
      // request_headers is a { name: value } map. The Worker authenticates the
      // static token (see WEBHOOK_TOKEN); it's stored server-side at ElevenLabs.
      request_headers: {
        'content-type': 'application/json',
        'x-webhook-token': o.webhookToken ?? '${WEBHOOK_TOKEN}',
      },
      request_body_schema: {
        type: 'object',
        properties: {
          // A property may set exactly ONE of description / constant_value / … —
          // `tool` is a fixed dispatch target, so it carries only constant_value.
          tool: { type: 'string', constant_value: t.name },
          parameters: t.parameters,
        },
        required: ['tool', 'parameters'],
      },
    },
  };
}

export function buildAgentConfig(o: BuildOpts) {
  const prompt = SYSTEM_PROMPT.replace('{PRACTICE_NAME}', o.practiceName);
  return {
    name: `${o.agentName} — ${o.practiceName}`,
    conversation_config: {
      agent: {
        first_message: `Hello, you've reached ${o.practiceName}. This is ${o.agentName}, the AI receptionist. How can I help you today?`,
        language: 'en',
        prompt: {
          prompt,
          llm: 'gpt-4o',
          temperature: 0.3,
          tools: TOOL_SCHEMAS.map((t) => toWebhookTool(t, o)),
        },
      },
      // English agents must use an English TTS model (turbo/flash v2), not the
      // multilingual v2.5. flash v2 keeps latency low (~75ms).
      tts: { model_id: 'eleven_flash_v2' },
    },
  };
}

export function optsFromEnv(): BuildOpts {
  return {
    practiceName: process.env.PRACTICE_NAME ?? 'Meadowbrook Health Centre',
    agentName: process.env.AGENT_NAME ?? 'Nightingale',
    workerUrl: process.env.WORKER_URL ?? 'https://nightingale.<your-subdomain>.workers.dev',
    webhookToken: process.env.WEBHOOK_TOKEN,
  };
}

// `bun run voice:config` — write the reference config file.
if (import.meta.main) {
  const config = buildAgentConfig(optsFromEnv());
  const out = fileURLToPath(new URL('../voice/agent-config.json', import.meta.url));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(config, null, 2) + '\n');
  console.log('Wrote voice/agent-config.json');
  console.log('  workerUrl:', optsFromEnv().workerUrl);
  console.log('  tools:', TOOL_SCHEMAS.length);
}

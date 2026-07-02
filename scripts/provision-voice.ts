/**
 * Create (or preview) the Nightingale ElevenLabs Conversational AI agent from
 * the code-derived config, so Tier-1 voice is a single command:
 *
 *   WORKER_URL=https://nightingale.<sub>.workers.dev \
 *   WEBHOOK_TOKEN=<same value set as a Worker secret> \
 *   ELEVENLABS_API_KEY=<key> \
 *   bun run voice:provision
 *
 * On success it prints the new `agent_id` — set that as ELEVENLABS_AGENT_ID
 * (Worker secret) and the dashboard's voice widget lights up. Without an API key
 * it just prints the config it WOULD send (dry run), so you can review or paste
 * it into the ElevenLabs dashboard manually. See docs/VOICE_SETUP.md.
 */
import { buildAgentConfig, optsFromEnv } from './voice-config';

const opts = optsFromEnv();
const config = buildAgentConfig(opts);
const apiKey = process.env.ELEVENLABS_API_KEY;

if (opts.workerUrl.includes('<your-subdomain>')) {
  console.error('⚠  Set WORKER_URL to your deployed Worker origin first (deploy before voice).');
}
if (!opts.webhookToken) {
  console.error('⚠  Set WEBHOOK_TOKEN (and add it as a Worker secret) so tool calls authenticate.');
}

if (!apiKey) {
  console.log('No ELEVENLABS_API_KEY set — dry run. Config that would be sent:\n');
  console.log(JSON.stringify(config, null, 2));
  console.log('\nSet ELEVENLABS_API_KEY to actually create the agent.');
  process.exit(0);
}

const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
  method: 'POST',
  headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
  body: JSON.stringify(config),
});

const text = await res.text();
if (!res.ok) {
  console.error(`✗ ElevenLabs create failed (${res.status}):\n${text}`);
  console.error(
    '\nThe Convai API shape can change — if a field is rejected, compare with\n' +
      'https://elevenlabs.io/docs/conversational-ai/api-reference and adjust\n' +
      'scripts/voice-config.ts, or create the agent in the dashboard using the\n' +
      'generated voice/agent-config.json (docs/VOICE_SETUP.md).',
  );
  process.exit(1);
}

const data = JSON.parse(text) as { agent_id?: string };
console.log('✓ Created ElevenLabs agent.');
console.log('  agent_id:', data.agent_id ?? '(see response below)');
if (!data.agent_id) console.log(text);
console.log('\nNext: set ELEVENLABS_AGENT_ID to this id as a Worker secret:');
console.log(`  wrangler secret put ELEVENLABS_AGENT_ID   # paste ${data.agent_id ?? '<agent_id>'}`);

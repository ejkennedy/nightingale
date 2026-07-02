# Tier-1 voice setup (ElevenLabs Conversational AI)

Nightingale runs happily with **no voice** (Tiers 2/3). This guide turns on **Tier
1** — a real spoken agent in the browser that drives the same guarded tools.

## First, the thing everyone asks

**An `agent_id` is not a `voice_id`.**

- A **voice** is just how it sounds (a TTS voice).
- An **agent** (ElevenLabs _Conversational AI_ agent) is the whole receptionist:
  a system prompt + an LLM + tools + a chosen voice + a first message. It has its
  own **`agent_id`** — that is what `ELEVENLABS_AGENT_ID` must be.

So you **create an agent** (once); the voice is one setting inside it. Putting a
voice id in `ELEVENLABS_AGENT_ID` will render the widget but fail on connect.

## How the pieces fit

```
Browser widget ──speech──▶ ElevenLabs agent (STT + LLM + TTS)
                                  │  calls its "tools"
                                  ▼
                 POST {worker}/webhooks/elevenlabs/tool   ({ tool, parameters })
                                  │  authenticated by x-webhook-token
                                  ▼
                 the SAME guarded services the sim/GPT tiers use
```

Because the agent's tools call a **public** URL, **deploy the Worker first**
([DEPLOY.md](./DEPLOY.md)), then create the agent pointed at that URL.

## Option A — one command (recommended)

```bash
# 1) Deploy so the webhook URL is public (see DEPLOY.md), then set a shared token:
wrangler secret put WEBHOOK_TOKEN          # e.g. a long random string

# 2) Create the agent from Nightingale's own prompt + tools:
WORKER_URL=https://nightingale.<your-subdomain>.workers.dev \
WEBHOOK_TOKEN=<the same value you just set> \
ELEVENLABS_API_KEY=<your ElevenLabs key> \
bun run voice:provision
# → prints  agent_id: <id>

# 3) Tell the Worker which agent to embed:
wrangler secret put ELEVENLABS_AGENT_ID    # paste the id from step 2
```

Redeploy (or just set the secret) and the dashboard's **"Talk to Nightingale"**
panel shows the live widget; the header flips to **Tier 1 · Live voice**.

Run `bun run voice:provision` with **no** `ELEVENLABS_API_KEY` for a dry run that
prints the exact config it would send.

## Option B — the ElevenLabs dashboard (manual)

1. `bun run voice:config` → writes `voice/agent-config.json` (system prompt + the
   8 tools, pointed at your `WORKER_URL`; git-ignored as it can embed the token).
2. ElevenLabs → **Conversational AI → Agents → Create agent**.
3. Paste the system prompt from the file, pick a voice, set the first message.
4. Add the 8 **webhook tools** (one per function) from the file: each `POST`s to
   `{worker}/webhooks/elevenlabs/tool` with body `{ "tool": "<name>", "parameters": {…} }`
   and header `x-webhook-token: <your WEBHOOK_TOKEN>`.
5. Copy the agent's id into `ELEVENLABS_AGENT_ID`.

## Auth: how tool calls are trusted

The webhook accepts a call if **either** holds (SECURITY.md):

- a valid HMAC signature over the body (`WEBHOOK_HMAC_SECRET`), for signers that
  support it; **or**
- a matching `x-webhook-token` header (`WEBHOOK_TOKEN`) — the simplest path, which
  the generated tool config uses.

Set **one** of them as a Worker secret and give the same value to the agent. With
neither set, the webhook returns `503 webhook_not_configured`.

## Public vs private agents

- **Public agent** — the widget needs only `ELEVENLABS_AGENT_ID`. Simplest for a
  demo; low risk here since the data is synthetic and the webhook is token-gated.
- **Private agent** — the browser needs a short-lived signed URL. The Worker mints
  one at `GET /voice/signed-url` using `ELEVENLABS_API_KEY` (503 until keyed), so
  the key never reaches the client.

## Troubleshooting

- **Widget shows but won't connect** → `ELEVENLABS_AGENT_ID` is probably a _voice_
  id, or the agent is private (use a public agent or wire up the signed URL).
- **Agent talks but bookings don't happen** → the tool URL isn't your public
  Worker, or the `x-webhook-token` / `WEBHOOK_TOKEN` don't match (webhook returns
  401). Check the Worker logs.
- **`voice:provision` 4xx** → the Convai API shape may have changed; adjust
  `scripts/voice-config.ts` per the current
  [API reference](https://elevenlabs.io/docs/conversational-ai/api-reference), or
  use Option B.

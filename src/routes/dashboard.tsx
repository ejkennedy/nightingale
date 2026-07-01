/**
 * The demo dashboard — the single page an interviewer clicks. Rendered with
 * Hono JSX; live sections are HTML fragments that HTMX polls every few seconds.
 * Everything shown is already PII-redacted (ADR-0007).
 */
import { Hono } from 'hono';
import { raw } from 'hono/html';
import type { FC } from 'hono/jsx';
import { PROMPT_VERSION } from '../agent/prompt';
import { SCENARIOS } from '../agent/scenarios';
import { getRecentEmails } from '../db/emails';
import {
  getBookingLog,
  getEscalations,
  getLatencyStats,
  getRecentCalls,
  getStats,
  getTranscript,
  type TranscriptEntry,
} from '../db/read-model';
import { seedDatabase } from '../db/seed-data';
import { activeTier, type Env } from '../env';
import { runScenarioCall } from './sim';

export const dashboard = new Hono<{ Bindings: Env }>();

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));

const TIER_LABEL: Record<string, string> = {
  voice: 'Tier 1 · Live voice',
  gpt: 'Tier 2 · GPT chat',
  scripted: 'Tier 3 · Scripted (no keys)',
};

// ---------------------------------------------------------------- page shell

/** The lamp — Florence Nightingale, "the Lady with the Lamp". The one memorable mark. */
const LampMark: FC = () => (
  <span class="mark" aria-hidden="true">
    <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
      <path
        class="flame"
        d="M16 4.2c3.5 3.3 5.6 5.9 5.6 9.3a5.6 5.6 0 0 1-11.2 0c0-3.4 2.1-6 5.6-9.3z"
      />
      <path
        class="flame-core"
        d="M16 11c1.8 1.6 2.8 2.9 2.8 4.6a2.8 2.8 0 0 1-5.6 0c0-1.7 1-3 2.8-4.6z"
      />
      <path class="wick" d="M9.2 24.6h13.6" />
    </svg>
  </span>
);

const Layout: FC<{ env: Env }> = ({ env }) => {
  const tier = activeTier(env);
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>{env.AGENT_NAME} — AI receptionist dashboard</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
        <script
          src="https://unpkg.com/htmx.org@2.0.3"
          integrity="sha384-0895/pl2MU10Hqc6jd4RvrthNlDiE9U1tWmX7WRESftEDRosgxNsQG/Ze9YMRzHq"
          crossorigin="anonymous"
        ></script>
        <style>{raw(CSS)}</style>
      </head>
      <body>
        <div class="banner" role="note">
          <span class="banner-dot" aria-hidden="true"></span>
          <span>
            <strong>Demonstration only</strong> — every patient, booking and call is synthetic. Not
            a real medical service.
          </span>
        </div>

        <div class="wrap">
          <header>
            <div class="brand">
              <LampMark />
              <div class="brand-text">
                <h1>{env.AGENT_NAME}</h1>
                <p class="sub">AI receptionist · {env.PRACTICE_NAME}</p>
              </div>
            </div>
            <div class="badges">
              <span class={`tier tier-${tier}`}>
                <span class="tier-dot" aria-hidden="true"></span>
                {TIER_LABEL[tier]}
              </span>
              <span class="ver">prompt {PROMPT_VERSION}</span>
            </div>
          </header>

          <section class="panel controls" aria-labelledby="controls-title">
            <h2 id="controls-title">Run a demo call</h2>
            <p class="hint">
              Each scenario drives the real agent and its tools against the live database — no API
              keys required.
            </p>
            <div class="scenarios">
              {SCENARIOS.map((s) => (
                <button
                  class="btn"
                  type="button"
                  hx-post="/ui/run-scenario"
                  hx-vals={`{"id":"${s.id}"}`}
                  hx-target="#run-status"
                  hx-swap="innerHTML"
                  title={s.description}
                >
                  <span class="btn-dot" aria-hidden="true"></span>
                  {s.title}
                </button>
              ))}
            </div>
            <div id="run-status" class="run-status" aria-live="polite"></div>
            <details class="admin">
              <summary>Admin controls</summary>
              <form hx-post="/ui/reseed" hx-target="#reseed-status" hx-swap="innerHTML">
                <input
                  type="password"
                  name="token"
                  placeholder="admin token"
                  aria-label="admin token"
                />
                <button class="btn ghost" type="submit">
                  Re-seed database
                </button>
                <span id="reseed-status" class="run-status"></span>
              </form>
            </details>
          </section>

          <div id="stats" hx-get="/ui/stats" hx-trigger="load, every 3s" hx-swap="innerHTML"></div>

          <div class="grid">
            <section class="panel col-2">
              <h2>
                Live transcript
                <span class="live">
                  <span class="live-dot" aria-hidden="true"></span>live
                </span>
              </h2>
              <div
                class="panel-body"
                hx-get="/ui/transcript"
                hx-trigger="load, every 2s"
                hx-swap="innerHTML"
              >
                <p class="empty">Run a scenario to see a call.</p>
              </div>
            </section>
            <section class="panel">
              <h2>
                Latency <span class="tag">per tool</span>
              </h2>
              <div
                class="panel-body"
                hx-get="/ui/latency"
                hx-trigger="load, every 3s"
                hx-swap="innerHTML"
              ></div>
            </section>
            <section class="panel col-2">
              <h2>Booking log</h2>
              <div
                class="panel-body"
                hx-get="/ui/bookings"
                hx-trigger="load, every 3s"
                hx-swap="innerHTML"
              ></div>
            </section>
            <section class="panel">
              <h2>Escalations</h2>
              <div
                class="panel-body"
                hx-get="/ui/escalations"
                hx-trigger="load, every 3s"
                hx-swap="innerHTML"
              ></div>
            </section>
            <section class="panel col-3">
              <h2>Latest confirmation email</h2>
              <div
                class="panel-body"
                hx-get="/ui/email"
                hx-trigger="load, every 3s"
                hx-swap="innerHTML"
              ></div>
            </section>
          </div>

          <footer>
            <span class="foot-mark" aria-hidden="true">
              🪶
            </span>
            <a href="https://github.com/ejkennedy/nightingale">github.com/ejkennedy/nightingale</a>
            <span class="foot-stack">Cloudflare Workers · Hono · D1 · ElevenLabs · OpenAI</span>
          </footer>
        </div>
      </body>
    </html>
  );
};

// ---------------------------------------------------------------- fragments

const StatCard: FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <div class={`stat ${tone ?? ''}`}>
    <div class="stat-value">{value}</div>
    <div class="stat-label">{label}</div>
  </div>
);

const Transcript: FC<{ entries: TranscriptEntry[]; heading: string }> = ({ entries, heading }) => (
  <>
    <p class="call-head">{heading}</p>
    <div class="transcript">
      {entries.length === 0 ? <p class="empty">No events yet.</p> : null}
      {entries.map((e) => {
        const p = (e.payload ?? {}) as Record<string, unknown>;
        if (e.type === 'turn') {
          const who = e.role === 'patient' ? 'caller' : 'agent';
          return (
            <div class={`bubble ${who}`}>
              <span class="who">{who === 'caller' ? 'Caller' : 'Nightingale'}</span>
              <span class="says">{String(p.text ?? '')}</span>
            </div>
          );
        }
        if (e.type === 'tool_call') {
          return (
            <div class="tool call">
              → {e.tool}({shortArgs(p)})
            </div>
          );
        }
        if (e.type === 'tool_result') {
          const ok = p.ok !== false;
          return (
            <div class={`tool result ${ok ? 'ok' : 'err'}`}>
              {ok ? '✓' : '✗'} {e.tool} · {e.latencyMs ?? 0}ms {p.code ? `· ${p.code}` : ''}
            </div>
          );
        }
        return null;
      })}
    </div>
  </>
);

function shortArgs(p: Record<string, unknown>): string {
  const parts = Object.entries(p)
    .filter(([k]) => !['symptoms'].includes(k))
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 18)}`);
  return parts.join(', ');
}

// ---------------------------------------------------------------- routes

dashboard.get('/', (c) => c.html(<Layout env={c.env} />));

dashboard.get('/ui/stats', async (c) => {
  const s = await getStats(c.env.DB);
  return c.html(
    <div class="stats-row">
      <StatCard label="Calls handled" value={String(s.totalCalls)} />
      <StatCard label="Contained" value={`${Math.round(s.containmentRate * 100)}%`} tone="ok" />
      <StatCard label="Bookings" value={String(s.bookings)} />
      <StatCard label="Escalations" value={String(s.escalated)} tone="warn" />
      <StatCard label="Open tasks" value={String(s.openEscalations)} />
    </div>,
  );
});

dashboard.get('/ui/transcript', async (c) => {
  const [latest] = await getRecentCalls(c.env.DB, 1);
  if (!latest) return c.html(<p class="empty">Run a scenario to see a call.</p>);
  const entries = await getTranscript(c.env.DB, latest.id);
  return c.html(
    <Transcript
      entries={entries}
      heading={`${latest.channel} call · ${fmtTime(latest.startedAt)}`}
    />,
  );
});

dashboard.get('/ui/bookings', async (c) => {
  const rows = await getBookingLog(c.env.DB, 12);
  if (rows.length === 0) return c.html(<p class="empty">No bookings yet.</p>);
  return c.html(
    <table>
      <thead>
        <tr>
          <th>Patient</th>
          <th>Clinician</th>
          <th>When</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr>
            <td>{r.patient}</td>
            <td>{r.practitioner}</td>
            <td>{fmtTime(r.startsAt)}</td>
            <td>
              <span class={`pill ${r.status}`}>{r.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>,
  );
});

dashboard.get('/ui/latency', async (c) => {
  const rows = await getLatencyStats(c.env.DB);
  if (rows.length === 0) return c.html(<p class="empty">No tool calls yet.</p>);
  return c.html(
    <table>
      <thead>
        <tr>
          <th>Tool</th>
          <th>n</th>
          <th>p50</th>
          <th>p95</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr>
            <td>{r.tool}</td>
            <td>{r.count}</td>
            <td>{r.p50}ms</td>
            <td>{r.p95}ms</td>
          </tr>
        ))}
      </tbody>
    </table>,
  );
});

dashboard.get('/ui/escalations', async (c) => {
  const rows = await getEscalations(c.env.DB, 10);
  if (rows.length === 0) return c.html(<p class="empty">No escalations.</p>);
  return c.html(
    <ul class="escalations">
      {rows.map((r) => (
        <li>
          <span class={`pill ${r.urgency ?? 'routine'}`}>{r.urgency ?? r.type}</span>
          <span class="etype">{r.type}</span>
          <span class="etime">{fmtTime(r.createdAt)}</span>
        </li>
      ))}
    </ul>,
  );
});

dashboard.get('/ui/email', async (c) => {
  const [email] = await getRecentEmails(c.env.DB, 1);
  if (!email) return c.html(<p class="empty">No confirmation emails yet — book an appointment.</p>);
  return c.html(
    <div>
      <p class="email-meta">
        To {email.recipientRedacted} · {email.subject} ·{' '}
        <span class={email.sent ? 'pill booked' : 'pill routine'}>
          {email.sent ? 'sent via Resend' : 'preview (no key)'}
        </span>
      </p>
      <iframe class="email-frame" srcdoc={email.html} title="confirmation email"></iframe>
    </div>,
  );
});

dashboard.post('/ui/run-scenario', async (c) => {
  const body = await c.req.parseBody();
  const result = await runScenarioCall(c.env, String(body.id ?? ''));
  if (!result) return c.html(<span class="status err">Unknown scenario</span>);
  return c.html(
    <span class="status ok">
      Ran “{result.scenario.title}” — {result.invocations.length} tool call(s). Live panels
      updating…
    </span>,
  );
});

dashboard.post('/ui/reseed', async (c) => {
  const body = await c.req.parseBody();
  if (!c.env.ADMIN_TOKEN || String(body.token ?? '') !== c.env.ADMIN_TOKEN) {
    return c.html(<span class="status err">Invalid admin token.</span>, 401);
  }
  const { slots } = await seedDatabase(c.env.DB, new Date());
  return c.html(<span class="status ok">Re-seeded — {slots} fresh slots.</span>);
});

// ---------------------------------------------------------------- styles

const CSS = `
:root{
  --bg:#f2ede3; --bg-2:#ece4d6; --paper:#fbf8f2; --paper-2:#f4eee2;
  --ink:#1f2d29; --ink-soft:#39473f; --muted:#5f665d; --line:#e6dfd0; --line-2:#efe8db;
  --pine:#0f5e54; --pine-700:#0b4a42; --pine-tint:#e6efe9; --pine-edge:#d1e2da;
  --gold:#b98a3e; --gold-soft:#f1e3c6;
  --ok:#2f7d5b; --ok-tint:#e4f0e8; --ok-edge:#cfe6d6;
  --warn:#a86a1c; --warn-tint:#f6e9d3;
  --danger:#b23b2e; --danger-tint:#f6ded9; --danger-edge:#ecc9bf;
  --info-tint:#e3eef2;
  --font-display:'Fraunces','Iowan Old Style',Georgia,'Times New Roman',serif;
  --font-sans:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  --font-mono:'IBM Plex Mono',ui-monospace,'SF Mono',Menlo,monospace;
  --r:16px; --r-sm:11px;
  --shadow:0 1px 2px rgba(28,42,38,.05),0 14px 34px -22px rgba(20,40,34,.4);
  --shadow-sm:0 1px 2px rgba(28,42,38,.05);
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;min-height:100vh;position:relative;color:var(--ink);line-height:1.55;
  font-family:var(--font-sans);font-size:15px;-webkit-font-smoothing:antialiased;
  background:
    radial-gradient(130% 82% at 50% -28%, rgba(185,138,62,.11), rgba(185,138,62,0) 55%),
    linear-gradient(180deg,var(--bg),var(--bg-2));
  background-attachment:fixed;
}
body::before{
  content:"";position:fixed;inset:0;z-index:0;pointer-events:none;mix-blend-mode:multiply;
  background-image:repeating-linear-gradient(135deg,rgba(31,45,41,.016) 0 1px,transparent 1px 7px);
}
.banner,.wrap{position:relative;z-index:1}
a{color:inherit}

/* --- top ribbon --- */
.banner{
  display:flex;align-items:center;justify-content:center;gap:9px;flex-wrap:wrap;
  background:linear-gradient(90deg,var(--gold-soft),#f7edd7);color:#6b4e1c;
  font-size:12.5px;padding:8px 16px;text-align:center;border-bottom:1px solid #ecdcb6;
}
.banner strong{font-weight:700}
.banner-dot{width:7px;height:7px;border-radius:50%;background:#c08a2e;flex:none}

.wrap{max-width:1180px;margin:0 auto;padding:0 26px 44px}

/* --- header / wordmark --- */
header{display:flex;justify-content:space-between;align-items:center;gap:22px;flex-wrap:wrap;padding:30px 0 22px}
.brand{display:flex;align-items:center;gap:15px}
.mark{
  display:grid;place-items:center;width:48px;height:48px;border-radius:15px;flex:none;
  background:linear-gradient(158deg,var(--pine),var(--pine-700));
  box-shadow:0 8px 20px -10px rgba(15,94,84,.75),inset 0 1px 0 rgba(255,255,255,.14);
}
.mark svg{overflow:visible}
.mark .flame{fill:var(--gold);filter:drop-shadow(0 0 5px rgba(240,212,140,.65))}
.mark .flame-core{fill:#fff6e2}
.mark .wick{stroke:rgba(255,255,255,.55);stroke-width:2;stroke-linecap:round}
h1{font-family:var(--font-display);font-weight:600;font-size:31px;letter-spacing:-.4px;margin:0;color:var(--ink)}
.sub{margin:4px 0 0;color:var(--muted);font-size:13.5px}
.badges{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tier{display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;padding:7px 13px;border-radius:999px;border:1px solid transparent}
.tier-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.tier-scripted{background:var(--pine-tint);color:#0d5249;border-color:var(--pine-edge)}
.tier-gpt{background:#e2edf4;color:#1f5876;border-color:#cfe0ec}
.tier-voice{background:var(--gold-soft);color:#7a5a1e;border-color:#e6d3a8}
.ver{font-family:var(--font-mono);font-size:12px;color:var(--muted);background:var(--paper);border:1px solid var(--line);padding:6px 11px;border-radius:999px}

/* --- panels --- */
.panel{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:20px 22px;box-shadow:var(--shadow)}
.controls{margin-top:6px}
h2{font-family:var(--font-display);font-weight:500;font-size:16.5px;color:var(--ink);margin:0 0 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.hint{color:var(--muted);font-size:13.5px;margin:6px 0 14px;max-width:62ch}
.tag{font-family:var(--font-mono);font-size:10.5px;font-weight:400;color:var(--muted);background:var(--paper-2);border:1px solid var(--line);padding:2px 8px;border-radius:999px}
.panel-body{min-height:56px;overflow-x:auto}

/* --- buttons --- */
.scenarios{display:flex;flex-wrap:wrap;gap:10px}
.btn{
  display:inline-flex;align-items:center;gap:8px;cursor:pointer;
  background:var(--pine);color:#fbf8f2;border:1px solid transparent;border-radius:var(--r-sm);
  padding:10px 15px;font:600 13px/1 var(--font-sans);
  box-shadow:0 1px 2px rgba(15,94,84,.25);
  transition:transform .13s ease,box-shadow .13s ease,background .13s ease;
}
.btn:hover{background:var(--pine-700);transform:translateY(-1px);box-shadow:0 9px 20px -11px rgba(15,94,84,.75)}
.btn:active{transform:translateY(0)}
.btn-dot{width:6px;height:6px;border-radius:50%;background:var(--gold)}
.btn.ghost{background:var(--paper);color:var(--ink);border-color:var(--line);box-shadow:none}
.btn.ghost:hover{background:var(--paper-2);border-color:var(--pine);color:var(--pine)}
.btn.ghost .btn-dot{display:none}
:where(.btn,.admin input,.admin summary,a,summary):focus-visible{outline:2px solid var(--pine);outline-offset:2px;border-radius:8px}

.run-status{display:inline-block;margin-top:12px;font-size:13px}
.status.ok{color:var(--ok);font-weight:500}
.status.err{color:var(--danger);font-weight:500}

/* --- admin --- */
.admin{margin-top:16px;font-size:13px;border-top:1px dashed var(--line);padding-top:13px}
.admin summary{cursor:pointer;color:var(--muted);font-weight:500;list-style:none;width:max-content}
.admin summary::-webkit-details-marker{display:none}
.admin summary::before{content:"⚙  "}
.admin form{display:flex;gap:8px;align-items:center;margin-top:11px;flex-wrap:wrap}
.admin input{padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:var(--paper);font:400 13px var(--font-sans);color:var(--ink)}
.admin input::placeholder{color:var(--muted)}

/* --- stats --- */
#stats{margin-top:16px;display:block}
.stats-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}
.stat{position:relative;overflow:hidden;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:17px 17px 15px;box-shadow:var(--shadow-sm)}
.stat::before{content:"";position:absolute;left:0;top:0;width:100%;height:3px;background:var(--line)}
.stat.ok::before{background:linear-gradient(90deg,var(--ok),transparent 85%)}
.stat.warn::before{background:linear-gradient(90deg,var(--warn),transparent 85%)}
.stat-value{font-family:var(--font-display);font-weight:600;font-size:31px;line-height:1;letter-spacing:-.5px;font-variant-numeric:tabular-nums;color:var(--ink)}
.stat.ok .stat-value{color:var(--ok)}
.stat.warn .stat-value{color:var(--warn)}
.stat-label{margin-top:7px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600}

/* --- grid --- */
.grid{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.col-2{grid-column:span 2}.col-3{grid-column:span 3}

/* --- transcript --- */
.live{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-sans);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--ok)}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px var(--ok-tint)}
.call-head{font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0 0 12px}
.transcript{display:flex;flex-direction:column;gap:9px;max-height:392px;overflow:auto;padding-right:4px}
.transcript::-webkit-scrollbar{width:8px}
.transcript::-webkit-scrollbar-thumb{background:var(--line);border-radius:8px}
.bubble{padding:9px 13px;border-radius:13px;font-size:14px;line-height:1.45;display:flex;flex-direction:column;gap:3px;max-width:86%;box-shadow:var(--shadow-sm);overflow-wrap:anywhere}
.bubble .who{font:600 10.5px/1 var(--font-sans);text-transform:uppercase;letter-spacing:.06em;display:inline-flex;align-items:center;gap:6px}
.bubble .who::before{content:"";width:6px;height:6px;border-radius:50%}
.bubble.caller{background:var(--paper-2);border:1px solid var(--line);align-self:flex-start;border-bottom-left-radius:5px}
.bubble.caller .who{color:var(--muted)}
.bubble.caller .who::before{background:var(--muted)}
.bubble.agent{background:var(--pine-tint);border:1px solid var(--pine-edge);align-self:flex-end;border-bottom-right-radius:5px}
.bubble.agent .who{color:var(--pine)}
.bubble.agent .who::before{background:var(--pine)}
.tool{font:500 12px/1.4 var(--font-mono);padding:5px 10px;border-radius:8px;align-self:flex-start;max-width:100%;overflow-wrap:anywhere;border:1px solid transparent}
.tool.call{color:var(--pine);background:var(--pine-tint);border-color:var(--pine-edge)}
.tool.result.ok{color:var(--ok);background:var(--ok-tint);border-color:var(--ok-edge)}
.tool.result.err{color:var(--danger);background:var(--danger-tint);border-color:var(--danger-edge)}

/* --- tables --- */
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
th{text-align:left;font:600 10.5px/1 var(--font-sans);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:0 10px 9px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid var(--line-2);color:var(--ink-soft)}
td:first-child{color:var(--ink);font-weight:500}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--paper-2)}

/* --- pills --- */
.pill{display:inline-block;font:600 11px/1.5 var(--font-sans);padding:2px 9px;border-radius:999px;text-transform:capitalize}
.pill.booked,.pill.contained{background:var(--ok-tint);color:#1f6a48}
.pill.cancelled{background:var(--paper-2);color:var(--muted)}
.pill.emergency{background:var(--danger-tint);color:#8f2a20}
.pill.urgent{background:var(--warn-tint);color:#8a5314}
.pill.routine{background:var(--info-tint);color:#245b6b}

/* --- escalations --- */
.escalations{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.escalations li{display:flex;align-items:center;gap:10px;font-size:13.5px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:var(--paper-2)}
.etype{color:var(--ink);text-transform:capitalize}
.etime{margin-left:auto;font:500 12px/1 var(--font-mono);color:var(--muted)}

/* --- email --- */
.email-meta{font-size:12.5px;color:var(--muted);margin:0 0 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.email-frame{display:block;width:100%;max-width:660px;height:344px;margin:0 auto;border:1px solid var(--line);border-radius:12px;background:#fff;box-shadow:var(--shadow-sm)}

.empty{color:var(--muted);font-size:13.5px;font-style:italic;padding:6px 0}

/* --- footer --- */
footer{margin-top:30px;padding-top:18px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:13px}
footer a{color:var(--pine);text-decoration:none;font-weight:600}
footer a:hover{text-decoration:underline}
.foot-mark{font-size:15px}

/* --- motion --- */
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes glow{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.25)}}
@media (prefers-reduced-motion:no-preference){
  header{animation:rise .55s .02s ease both}
  .controls{animation:rise .55s .10s ease both}
  #stats{animation:rise .55s .18s ease both}
  .grid .panel:nth-child(1){animation:rise .55s .26s ease both}
  .grid .panel:nth-child(2){animation:rise .55s .32s ease both}
  .grid .panel:nth-child(3){animation:rise .55s .38s ease both}
  .grid .panel:nth-child(4){animation:rise .55s .44s ease both}
  .grid .panel:nth-child(5){animation:rise .55s .50s ease both}
  footer{animation:rise .55s .56s ease both}
  .live-dot,.banner-dot{animation:glow 2.4s ease-in-out infinite}
}

/* --- responsive --- */
@media(max-width:900px){
  .grid{grid-template-columns:minmax(0,1fr)}
  .col-2,.col-3{grid-column:span 1}
  .stats-row{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:420px){
  .stats-row{grid-template-columns:minmax(0,1fr)}
}
@media(max-width:560px){
  .wrap{padding:0 16px 34px}
  header{padding-top:22px}
  h1{font-size:27px}
  .stats-row{gap:10px}
  .email-frame{height:300px}
}
`;

/**
 * The demo dashboard — the single page an interviewer clicks. Rendered with
 * Hono JSX; live sections are HTML fragments that HTMX polls every few seconds.
 * Everything shown is already PII-redacted (ADR-0007).
 */
import { Hono } from 'hono';
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

const Layout: FC<{ env: Env }> = ({ env }) => {
  const tier = activeTier(env);
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{env.AGENT_NAME} — AI receptionist dashboard</title>
        <script
          src="https://unpkg.com/htmx.org@2.0.3"
          integrity="sha384-0895/pl2MU10Hqc6jd4RvrthNlDiE9U1tWmX7WRESftEDRosgxNsQG/Ze9YMRzHq"
          crossorigin="anonymous"
        ></script>
        <style>{CSS}</style>
      </head>
      <body>
        <div class="banner">
          🔬 Demonstration only — all patient data is synthetic. Not a real medical service.
        </div>
        <header>
          <div class="brand">
            <span class="logo">🕊️</span>
            <div>
              <h1>{env.AGENT_NAME}</h1>
              <p class="sub">AI receptionist · {env.PRACTICE_NAME}</p>
            </div>
          </div>
          <div class="badges">
            <span class={`tier tier-${tier}`}>{TIER_LABEL[tier]}</span>
            <span class="ver">prompt {PROMPT_VERSION}</span>
          </div>
        </header>

        <section class="panel controls">
          <h2>Run a demo call</h2>
          <p class="hint">Each scenario drives the real agent + tools against the live database.</p>
          <div class="scenarios">
            {SCENARIOS.map((s) => (
              <button
                class="btn"
                hx-post="/ui/run-scenario"
                hx-vals={`{"id":"${s.id}"}`}
                hx-target="#run-status"
                hx-swap="innerHTML"
                title={s.description}
              >
                {s.title}
              </button>
            ))}
          </div>
          <div id="run-status" class="run-status" aria-live="polite"></div>
          <details class="admin">
            <summary>Admin</summary>
            <form hx-post="/ui/reseed" hx-target="#reseed-status" hx-swap="innerHTML">
              <input type="password" name="token" placeholder="admin token" />
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
              Live transcript <span class="live">● live</span>
            </h2>
            <div hx-get="/ui/transcript" hx-trigger="load, every 2s" hx-swap="innerHTML">
              <p class="empty">Run a scenario to see a call.</p>
            </div>
          </section>
          <section class="panel">
            <h2>
              Latency <span class="hint">per tool</span>
            </h2>
            <div hx-get="/ui/latency" hx-trigger="load, every 3s" hx-swap="innerHTML"></div>
          </section>
          <section class="panel col-2">
            <h2>Booking log</h2>
            <div hx-get="/ui/bookings" hx-trigger="load, every 3s" hx-swap="innerHTML"></div>
          </section>
          <section class="panel">
            <h2>Escalations</h2>
            <div hx-get="/ui/escalations" hx-trigger="load, every 3s" hx-swap="innerHTML"></div>
          </section>
          <section class="panel col-3">
            <h2>Latest confirmation email</h2>
            <div hx-get="/ui/email" hx-trigger="load, every 3s" hx-swap="innerHTML"></div>
          </section>
        </div>

        <footer>
          <a href="https://github.com/ejkennedy/nightingale">github.com/ejkennedy/nightingale</a>
          <span>· Cloudflare Workers · Hono · D1 · ElevenLabs · OpenAI</span>
        </footer>
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
              <span class="who">{who === 'caller' ? '👤 Caller' : '🕊️ Nightingale'}</span>
              <span>{String(p.text ?? '')}</span>
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
:root{--bg:#eef2f8;--card:#fff;--ink:#1a2b4a;--muted:#5b6b85;--line:#e2e8f0;--accent:#2563eb;--teal:#0e7490;--ok:#16a34a;--warn:#c2410c;--danger:#b91c1c}
*{box-sizing:border-box}
body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;margin:0;background:var(--bg);color:var(--ink);line-height:1.5}
.banner{background:#fef3c7;color:#92400e;text-align:center;font-size:13px;padding:6px 12px}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;max-width:1100px;margin:0 auto;padding:20px 20px 8px}
.brand{display:flex;align-items:center;gap:12px}
.logo{font-size:34px}
h1{font-size:22px;margin:0}
.sub{margin:0;color:var(--muted);font-size:14px}
.badges{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tier{font-weight:600;font-size:13px;padding:5px 12px;border-radius:999px}
.tier-scripted{background:#dcfce7;color:#166534}
.tier-gpt{background:#dbeafe;color:#1e40af}
.tier-voice{background:#ede9fe;color:#5b21b6}
.ver{font-size:12px;color:var(--muted);background:#fff;border:1px solid var(--line);padding:4px 10px;border-radius:999px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 1px 2px rgba(16,32,64,.04)}
.controls{max-width:1100px;margin:12px auto;}
h2{font-size:15px;margin:0 0 10px;display:flex;align-items:center;gap:8px}
.hint{color:var(--muted);font-size:13px;font-weight:400;margin:0 0 10px}
.scenarios{display:flex;flex-wrap:wrap;gap:8px}
.btn{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer}
.btn:hover{filter:brightness(1.07)}
.btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.run-status{display:inline-block;margin-top:10px;font-size:13px}
.status.ok{color:var(--ok)} .status.err{color:var(--danger)}
.admin{margin-top:14px;font-size:13px}
.admin summary{cursor:pointer;color:var(--muted)}
.admin form{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.admin input{padding:8px 10px;border:1px solid var(--line);border-radius:8px}
.grid{max-width:1100px;margin:12px auto 0;padding:0 20px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.col-2{grid-column:span 2}.col-3{grid-column:span 3}
@media(max-width:820px){.grid{grid-template-columns:1fr}.col-2,.col-3{grid-column:span 1}}
.stats-row{max-width:1100px;margin:12px auto 0;padding:0 20px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
@media(max-width:820px){.stats-row{grid-template-columns:repeat(2,1fr)}}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat-value{font-size:24px;font-weight:700}
.stat.ok .stat-value{color:var(--ok)} .stat.warn .stat-value{color:var(--warn)}
.stat-label{color:var(--muted);font-size:12px;margin-top:2px}
.live{color:var(--ok);font-size:11px;font-weight:600}
.call-head{color:var(--muted);font-size:12px;margin:0 0 8px}
.transcript{display:flex;flex-direction:column;gap:6px;max-height:360px;overflow:auto}
.bubble{padding:8px 12px;border-radius:10px;font-size:14px;display:flex;flex-direction:column;gap:2px;max-width:88%}
.bubble .who{font-size:11px;color:var(--muted)}
.bubble.caller{background:#f1f5f9;align-self:flex-start}
.bubble.agent{background:#eff6ff;align-self:flex-end}
.tool{font-family:ui-monospace,monospace;font-size:12px;padding:3px 8px;border-radius:6px;align-self:flex-start}
.tool.call{color:var(--teal);background:#ecfeff}
.tool.result.ok{color:var(--ok);background:#f0fdf4}
.tool.result.err{color:var(--danger);background:#fef2f2}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--muted);font-weight:600;font-size:12px;border-bottom:1px solid var(--line);padding:6px 8px}
td{padding:7px 8px;border-bottom:1px solid #f1f5f9}
.pill{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px}
.pill.booked,.pill.contained{background:#dcfce7;color:#166534}
.pill.cancelled{background:#f1f5f9;color:#475569}
.pill.emergency{background:#fee2e2;color:#991b1b}
.pill.urgent{background:#ffedd5;color:#9a3412}
.pill.routine{background:#e0f2fe;color:#075985}
.escalations{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.escalations li{display:flex;align-items:center;gap:8px;font-size:13px}
.etype{color:var(--ink)}.etime{margin-left:auto;color:var(--muted);font-size:12px}
.email-meta{font-size:12px;color:var(--muted);margin:0 0 8px}
.email-frame{width:100%;height:320px;border:1px solid var(--line);border-radius:10px;background:#fff}
.empty{color:var(--muted);font-size:13px;font-style:italic}
footer{max-width:1100px;margin:24px auto;padding:0 20px 32px;color:var(--muted);font-size:13px}
footer a{color:var(--accent);text-decoration:none}
`;

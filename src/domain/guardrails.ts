/**
 * Clinical & conversational guardrails (ADR-0006/0007).
 *
 * These are DETERMINISTic, pure functions — the safety-critical decisions
 * (is this a medical emergency? is this a jailbreak attempt?) are made in code
 * and unit-tested, never delegated to the model's judgement. The agent uses
 * their output to escalate or refuse; it can never be talked out of them.
 */

export type Urgency = 'routine' | 'urgent' | 'emergency';

export interface RedFlagResult {
  isRedFlag: boolean;
  matched: string[];
}

/**
 * Red-flag symptom phrases that must trigger an immediate human/999 handoff.
 * Kept broad and lowercase; matched as word-ish substrings. This is a demo
 * safety net, not a clinical triage tool.
 */
const RED_FLAGS: Array<[label: string, patterns: RegExp[]]> = [
  ['chest pain', [/\bchest pain\b/, /\bpain in (my|the) chest\b/, /\btight chest\b/]],
  [
    'difficulty breathing',
    [
      /\b(can'?t|cannot|struggling to|difficulty) breath/,
      /\bshort(ness)? of breath\b/,
      /\bnot breathing\b/,
    ],
  ],
  [
    'stroke signs',
    [
      /\bface (is )?droop/,
      /\bslurred speech\b/,
      /\bnumb(ness)? (on )?one side\b/,
      /\bcan'?t move (my )?(arm|leg|face)\b/,
    ],
  ],
  [
    'severe bleeding',
    [/\b(heavy|severe|won'?t stop|uncontrolled) bleed/, /\bbleeding (a lot|badly|heavily)\b/],
  ],
  ['unconscious', [/\bunconscious\b/, /\bpassed out\b/, /\bcollapsed\b/, /\bnot responding\b/]],
  ['anaphylaxis', [/\banaphyla/, /\bthroat (is )?closing\b/, /\bsevere allergic reaction\b/]],
  [
    'suicidal / self-harm',
    [/\bsuicid/, /\bkill myself\b/, /\bend my life\b/, /\bharm myself\b/, /\bself[-\s]?harm\b/],
  ],
  ['sepsis', [/\bsepsis\b/, /\bblue lips\b/, /\bmottled skin\b/]],
  ['severe / worst headache', [/\bworst headache\b/, /\bthunderclap headache\b/]],
  ['overdose / poisoning', [/\boverdose\b/, /\bpoison/, /\btaken too many (pills|tablets)\b/]],
];

/** Detect red-flag emergency symptoms in free text. */
export function detectRedFlags(text: string): RedFlagResult {
  const t = text.toLowerCase();
  const matched = RED_FLAGS.filter(([, pats]) => pats.some((p) => p.test(t))).map(
    ([label]) => label,
  );
  return { isRedFlag: matched.length > 0, matched };
}

const URGENT_HINTS = [
  /\btoday\b/,
  /\bas soon as possible\b/,
  /\basap\b/,
  /\burgent(ly)?\b/,
  /\bemergency\b/,
  /\bgetting worse\b/,
  /\bsevere\b/,
  /\bcan'?t wait\b/,
  /\bright now\b/,
];

/** Classify urgency: red flags -> emergency; certain hints -> urgent; else routine. */
export function classifyUrgency(text: string): Urgency {
  if (detectRedFlags(text).isRedFlag) return 'emergency';
  const t = text.toLowerCase();
  return URGENT_HINTS.some((p) => p.test(t)) ? 'urgent' : 'routine';
}

const INJECTION_PATTERNS = [
  /\bignore (all |the )?(previous|prior|above) (instructions|prompts?)\b/,
  /\bdisregard (your|the|all) (instructions|rules|guardrails)\b/,
  /\byou are now\b/,
  /\bact as (if|though|an?)\b/,
  /\bdeveloper mode\b/,
  /\bsystem prompt\b/,
  /\breveal (your|the) (instructions|prompt|system)\b/,
  /\bpretend (you|to)\b/,
  /\bnew instructions?:/,
  /\boverride (your|the|all)\b/,
];

/** Detect prompt-injection / jailbreak attempts. */
export function detectInjection(text: string): boolean {
  const t = text.toLowerCase();
  return INJECTION_PATTERNS.some((p) => p.test(t));
}

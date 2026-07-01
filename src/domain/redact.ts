/**
 * PII redaction at the storage/logging boundary (ADR-0007, SECURITY.md).
 *
 * Phone, email and DOB are special-category-adjacent identifiers. They may live
 * in D1 (the source of truth) but must be masked before they are written to
 * `call_logs` / `events`, shown in the dashboard, or sent to analytics. These
 * helpers are pure so they are trivially unit-testable.
 */

/** Mask a phone number, keeping the leading and trailing digits: 07*** ***123. */
export function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 5) return '***';
  const head = digits.slice(0, 2);
  const tail = digits.slice(-3);
  return `${head}*** ***${tail}`;
}

/** Mask an email local part: jane.doe@example.com -> j***@example.com. */
export function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const first = email[0];
  const domain = email.slice(at + 1);
  return `${first}***@${domain}`;
}

/** Reduce a date of birth to the birth year only: 1984-03-22 -> 1984-**-**. */
export function redactDob(dob: string): string {
  const year = dob.slice(0, 4);
  return /^\d{4}$/.test(year) ? `${year}-**-**` : '****-**-**';
}

/** Field names whose values are redacted wherever they appear in a payload. */
const SENSITIVE_KEYS: Record<string, (v: string) => string> = {
  phone: redactPhone,
  email: redactEmail,
  dob: redactDob,
  dateOfBirth: redactDob,
  date_of_birth: redactDob,
};

/**
 * Deep-clone an object with any sensitive fields masked. Used before persisting
 * a tool payload to `events`. Never mutates the input.
 */
export function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPayload);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const masker = SENSITIVE_KEYS[k];
      out[k] = masker && typeof v === 'string' ? masker(v) : redactPayload(v);
    }
    return out;
  }
  return value;
}

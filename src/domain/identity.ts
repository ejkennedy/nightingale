/**
 * Identity verification (ADR-0006/0007). A caller must satisfy an identity claim
 * (last name + date of birth) before any appointment is disclosed or mutated.
 *
 * This is the pure matching logic; it is *enforced* in the tool router so a
 * jailbroken prompt cannot bypass it. Matching is deliberately strict on DOB and
 * lenient on name formatting (case/whitespace/accents) to be caller-friendly
 * without weakening the check.
 */
import type { IdentityClaim, Patient } from './types';

/** Lower-case, strip accents, collapse whitespace, drop non-letters. */
export function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ISO date, exact match required. Rejects anything not 'YYYY-MM-DD'. */
export function isValidDob(dob: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const d = new Date(`${dob}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dob;
}

/**
 * Coerce a caller-supplied DOB to canonical 'YYYY-MM-DD', or null if it isn't a
 * valid year-first date. A spoken date often reaches the tool as '1979-11-5',
 * '1979/11/05' or '1979.11.5' — we accept those (zero-pad + separators) so voice
 * verification isn't brittle. We deliberately DO NOT accept day-first / ambiguous
 * orders ('05/11/1979'): guessing day-vs-month on an identity gate is unsafe.
 */
export function normaliseDob(input: string): string | null {
  const m = input.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  return isValidDob(iso) ? iso : null;
}

/**
 * Does the patient satisfy the identity claim? Last name normalised-equal AND
 * DOB exactly equal (after canonicalising both to ISO). Never throws.
 */
export function matchesIdentity(patient: Patient, claim: IdentityClaim): boolean {
  const claimDob = normaliseDob(claim.dob);
  if (!claimDob) return false;
  const patientDob = normaliseDob(patient.dob) ?? patient.dob;
  return (
    normaliseName(patient.last_name) === normaliseName(claim.lastName) && patientDob === claimDob
  );
}

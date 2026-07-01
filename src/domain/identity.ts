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
 * Does the patient satisfy the identity claim? Last name normalised-equal AND
 * DOB exactly equal. Never throws.
 */
export function matchesIdentity(patient: Patient, claim: IdentityClaim): boolean {
  if (!isValidDob(claim.dob)) return false;
  return (
    normaliseName(patient.last_name) === normaliseName(claim.lastName) && patient.dob === claim.dob
  );
}

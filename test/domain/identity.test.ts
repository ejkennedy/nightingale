import { describe, expect, it } from 'vitest';
import {
  isValidDob,
  matchesIdentity,
  normaliseDob,
  normaliseName,
} from '../../src/domain/identity';
import type { Patient } from '../../src/domain/types';

const patient: Patient = {
  id: 'p1',
  first_name: 'Jane',
  last_name: 'Okafor',
  dob: '1984-03-22',
  phone: '07700900123',
  email: 'jane.doe@example.com',
};

describe('normaliseName', () => {
  it('is case, accent and whitespace insensitive', () => {
    expect(normaliseName('  ÓKÁFOR ')).toBe(normaliseName('okafor'));
    expect(normaliseName("O'Kafor")).toBe('o kafor');
  });
});

describe('isValidDob', () => {
  it('accepts a real ISO date', () => {
    expect(isValidDob('1984-03-22')).toBe(true);
  });
  it('rejects malformed or impossible dates', () => {
    expect(isValidDob('22/03/1984')).toBe(false);
    expect(isValidDob('1984-13-01')).toBe(false);
    expect(isValidDob('1984-02-30')).toBe(false);
  });
});

describe('normaliseDob — caller-friendly date coercion', () => {
  it('canonicalises zero-padding and separators', () => {
    expect(normaliseDob('1984-03-22')).toBe('1984-03-22');
    expect(normaliseDob('1984-3-22')).toBe('1984-03-22');
    expect(normaliseDob('1984/3/2')).toBe('1984-03-02');
    expect(normaliseDob('1984.03.22')).toBe('1984-03-22');
  });
  it('rejects day-first / ambiguous or impossible dates', () => {
    expect(normaliseDob('22/03/1984')).toBeNull(); // day-first is unsafe to guess
    expect(normaliseDob('1984-13-01')).toBeNull();
    expect(normaliseDob('not a date')).toBeNull();
  });
});

describe('matchesIdentity — the guardrail predicate', () => {
  it('matches on normalised last name + exact DOB', () => {
    expect(matchesIdentity(patient, { lastName: 'okafor', dob: '1984-03-22' })).toBe(true);
  });

  it('tolerates a spoken DOB that lost its zero-padding or uses slashes', () => {
    expect(matchesIdentity(patient, { lastName: 'Okafor', dob: '1984-3-22' })).toBe(true);
    expect(matchesIdentity(patient, { lastName: 'Okafor', dob: '1984/03/22' })).toBe(true);
  });

  it('rejects a wrong DOB even with the right name', () => {
    expect(matchesIdentity(patient, { lastName: 'Okafor', dob: '1984-03-23' })).toBe(false);
  });

  it('rejects a wrong name even with the right DOB', () => {
    expect(matchesIdentity(patient, { lastName: 'Smith', dob: '1984-03-22' })).toBe(false);
  });

  it('rejects a malformed DOB claim outright', () => {
    expect(matchesIdentity(patient, { lastName: 'Okafor', dob: '22-03-1984' })).toBe(false);
  });
});

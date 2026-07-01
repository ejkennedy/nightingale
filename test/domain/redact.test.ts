import { describe, expect, it } from 'vitest';
import { redactDob, redactEmail, redactPayload, redactPhone } from '../../src/domain/redact';

describe('redactPhone', () => {
  it('keeps first two and last three digits', () => {
    expect(redactPhone('07700900123')).toBe('07*** ***123');
  });
  it('ignores punctuation/spacing when counting digits', () => {
    expect(redactPhone('+44 7700 900123')).toBe('44*** ***123');
  });
  it('fully masks implausibly short values', () => {
    expect(redactPhone('123')).toBe('***');
  });
});

describe('redactEmail', () => {
  it('keeps the first char and the domain', () => {
    expect(redactEmail('jane.doe@example.com')).toBe('j***@example.com');
  });
  it('masks a malformed address', () => {
    expect(redactEmail('not-an-email')).toBe('***');
  });
});

describe('redactDob', () => {
  it('reduces to birth year only', () => {
    expect(redactDob('1984-03-22')).toBe('1984-**-**');
  });
  it('masks a malformed date', () => {
    expect(redactDob('nonsense')).toBe('****-**-**');
  });
});

describe('redactPayload', () => {
  it('masks sensitive fields recursively without mutating the input', () => {
    const input = {
      patient: { lastName: 'Okafor', dob: '1984-03-22', phone: '07700900123' },
      contact: { email: 'jane.doe@example.com' },
      reason: 'check-up',
    };
    const out = redactPayload(input) as typeof input;
    expect(out.patient.dob).toBe('1984-**-**');
    expect(out.patient.phone).toBe('07*** ***123');
    expect(out.contact.email).toBe('j***@example.com');
    expect(out.reason).toBe('check-up'); // non-sensitive preserved
    expect(input.patient.dob).toBe('1984-03-22'); // original untouched
  });

  it('handles arrays and primitives', () => {
    expect(redactPayload([{ phone: '07700900123' }])).toEqual([{ phone: '07*** ***123' }]);
    expect(redactPayload('plain')).toBe('plain');
    expect(redactPayload(42)).toBe(42);
  });
});

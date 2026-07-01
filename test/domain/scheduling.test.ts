import { describe, expect, it } from 'vitest';
import { formatSlotHuman, isBookable, toSlotOffer } from '../../src/domain/scheduling';
import type { Practitioner, Slot } from '../../src/domain/types';

describe('formatSlotHuman', () => {
  it('renders in Europe/London during BST (summer -> +1h)', () => {
    // 08:00 UTC on 2 Jul is 09:00 BST.
    expect(formatSlotHuman('2026-07-02T08:00:00Z', 'Europe/London')).toBe('Thu 2 Jul, 9:00 am');
  });

  it('renders in Europe/London during GMT (winter -> +0h)', () => {
    // 09:00 UTC on 7 Jan is 09:00 GMT.
    expect(formatSlotHuman('2026-01-07T09:00:00Z', 'Europe/London')).toBe('Wed 7 Jan, 9:00 am');
  });

  it('degrades gracefully on a bad timestamp', () => {
    expect(formatSlotHuman('not-a-date', 'Europe/London')).toBe('unknown time');
  });
});

describe('isBookable', () => {
  const now = new Date('2026-07-01T12:00:00Z');

  it('is true for an available future slot', () => {
    expect(isBookable({ status: 'available', starts_at: '2026-07-02T08:00:00Z' }, now)).toBe(true);
  });
  it('is false for a booked slot', () => {
    expect(isBookable({ status: 'booked', starts_at: '2026-07-02T08:00:00Z' }, now)).toBe(false);
  });
  it('is false for a past slot', () => {
    expect(isBookable({ status: 'available', starts_at: '2026-06-30T08:00:00Z' }, now)).toBe(false);
  });
});

describe('toSlotOffer', () => {
  it('joins a slot with its practitioner', () => {
    const slot: Slot = {
      id: 's1',
      practitioner_id: 'gp1',
      starts_at: '2026-07-02T08:00:00Z',
      duration_minutes: 10,
      status: 'available',
    };
    const gp: Practitioner = { id: 'gp1', name: 'Dr Sarah Okafor', role: 'GP', specialty: null };
    expect(toSlotOffer(slot, gp)).toEqual({
      slotId: 's1',
      practitionerName: 'Dr Sarah Okafor',
      role: 'GP',
      startsAt: '2026-07-02T08:00:00Z',
      durationMinutes: 10,
    });
  });
});

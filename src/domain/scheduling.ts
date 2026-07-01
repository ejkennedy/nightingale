/** Pure scheduling helpers — formatting and bookability rules (no I/O). */
import type { Practitioner, Slot, SlotOffer } from './types';

/**
 * Render a UTC instant in the practice timezone, e.g. "Thu 2 Jul, 9:00 am".
 * Uses Intl so DST (BST vs GMT) is handled correctly.
 */
export function formatSlotHuman(startsAtIso: string, timeZone: string): string {
  const d = new Date(startsAtIso);
  if (Number.isNaN(d.getTime())) return 'unknown time';
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  })
    .format(d)
    .replace(/\s?([ap])m/i, (_m, p: string) => ` ${p.toLowerCase()}m`);
  return `${date}, ${time}`;
}

/** A slot can be booked only if it is available and starts strictly after now. */
export function isBookable(slot: Pick<Slot, 'status' | 'starts_at'>, now: Date): boolean {
  if (slot.status !== 'available') return false;
  const starts = new Date(slot.starts_at);
  return !Number.isNaN(starts.getTime()) && starts.getTime() > now.getTime();
}

/** Combine a slot with its practitioner into the shape offered to a caller. */
export function toSlotOffer(slot: Slot, practitioner: Practitioner): SlotOffer {
  return {
    slotId: slot.id,
    practitionerName: practitioner.name,
    role: practitioner.role,
    startsAt: slot.starts_at,
    durationMinutes: slot.duration_minutes,
  };
}

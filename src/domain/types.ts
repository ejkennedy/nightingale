/** Core domain types, mirroring the D1 schema (migrations/0001_init.sql). */

export type PractitionerRole = 'GP' | 'Dentist' | 'Nurse';
export type SlotStatus = 'available' | 'booked' | 'blocked';
export type AppointmentStatus = 'booked' | 'cancelled' | 'completed';

export interface Practitioner {
  id: string;
  name: string;
  role: PractitionerRole;
  specialty: string | null;
}

export interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  dob: string; // 'YYYY-MM-DD'
  phone: string;
  email: string;
}

export interface Slot {
  id: string;
  practitioner_id: string;
  starts_at: string; // ISO-8601 UTC
  duration_minutes: number;
  status: SlotStatus;
}

export interface Appointment {
  id: string;
  slot_id: string;
  patient_id: string;
  reason: string | null;
  status: AppointmentStatus;
  created_at: string;
  cancelled_at: string | null;
}

/** The identity claim a caller must satisfy before any disclosure/mutation. */
export interface IdentityClaim {
  lastName: string;
  dob: string; // 'YYYY-MM-DD'
}

/** A slot joined with its practitioner, as offered to a caller. */
export interface SlotOffer {
  slotId: string;
  practitionerName: string;
  role: PractitionerRole;
  startsAt: string;
  durationMinutes: number;
}

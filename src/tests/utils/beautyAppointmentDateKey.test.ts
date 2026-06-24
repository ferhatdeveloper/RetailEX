import { describe, expect, it } from 'vitest';
import { beautyAppointmentDateKey } from '../../utils/dateLocal';

describe('beautyAppointmentDateKey', () => {
  it('uses updated_at date for early completed appointments', () => {
    expect(beautyAppointmentDateKey({
      appointment_date: '2026-06-25',
      status: 'completed',
      updated_at: '2026-06-15T09:30:00.000Z',
    })).toBe('2026-06-15');
  });

  it('keeps appointment date for same-day completed appointments', () => {
    expect(beautyAppointmentDateKey({
      appointment_date: '2026-06-25',
      status: 'completed',
      updated_at: '2026-06-25T09:30:00.000Z',
    })).toBe('2026-06-25');
  });

  it('keeps appointment date for non-completed appointments', () => {
    expect(beautyAppointmentDateKey({
      appointment_date: '2026-06-25',
      status: 'scheduled',
      updated_at: '2026-06-15T09:30:00.000Z',
    })).toBe('2026-06-25');
  });
});

import { describe, expect, it } from 'vitest';
import {
  beautyAppointmentDateKey,
  beautyAppointmentEarlyCompletionDateKey,
} from '../../utils/dateLocal';

describe('beautyAppointmentDateKey', () => {
  it('keeps appointment date for early completed appointments', () => {
    expect(beautyAppointmentDateKey({
      appointment_date: '2026-06-25',
    })).toBe('2026-06-25');
  });

  it('returns early completion date separately for yellow warning cards', () => {
    expect(beautyAppointmentEarlyCompletionDateKey({
      appointment_date: '2026-06-25',
      status: 'completed',
      updated_at: '2026-06-20T10:00:00.000Z',
    })).toBe('2026-06-20');
  });

  it('keeps appointment date for same-day completed appointments', () => {
    expect(beautyAppointmentDateKey({
      appointment_date: '2026-06-25',
    })).toBe('2026-06-25');
    expect(beautyAppointmentEarlyCompletionDateKey({
      appointment_date: '2026-06-25',
      status: 'completed',
      updated_at: '2026-06-25T09:30:00.000Z',
    })).toBe('');
  });

  it('keeps appointment date for non-completed appointments', () => {
    expect(beautyAppointmentDateKey({
      appointment_date: '2026-06-25',
    })).toBe('2026-06-25');
  });
});

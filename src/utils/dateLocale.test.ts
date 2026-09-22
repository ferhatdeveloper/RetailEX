import { describe, expect, it } from 'vitest';
import { formatDateTimeShort, formatShortDate } from './dateLocale';

describe('formatShortDate — her zaman gg.aa.yyyy', () => {
  it('ISO gün (YYYY-MM-DD) en-US dilinde bile 19.09.2026', () => {
    expect(formatShortDate('2026-09-19', 'en-US')).toBe('19.09.2026');
    expect(formatShortDate('2026-09-19', 'tr-TR')).toBe('19.09.2026');
  });

  it('UTC gece yarısı kayması yapmaz', () => {
    expect(formatShortDate('2026-09-19T00:00:00.000Z', 'en-US')).toBe('19.09.2026');
  });

  it('tarih+saat kısa gösterimde gün kısmı gg.aa.yyyy', () => {
    const text = formatDateTimeShort('2026-09-19T14:30:00', 'en-US');
    expect(text.startsWith('19.09.2026')).toBe(true);
  });

  it('iş günü UTC öğlesinde (TR 15:00) saat göstermez', () => {
    expect(formatDateTimeShort('2026-09-19T12:00:00.000Z', 'tr-TR')).toBe('19.09.2026');
    expect(formatDateTimeShort('2026-09-19T12:00:00', 'tr-TR')).toBe('19.09.2026');
  });
});

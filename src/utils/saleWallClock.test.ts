import { describe, expect, it } from 'vitest';
import {
  formatSaleWallClockTime,
  isBusinessDayClockAnchor,
  saleWallClockRaw,
} from './saleWallClock';

describe('saleWallClock', () => {
  it('UTC öğleyi iş günü sabiti sayar', () => {
    expect(isBusinessDayClockAnchor('2026-09-22T12:00:00.000Z')).toBe(true);
    expect(isBusinessDayClockAnchor('2026-09-22T14:37:22.000Z')).toBe(false);
  });

  it('created_at varsa duvar saatini kullanır', () => {
    const src = {
      date: '2026-09-22T12:00:00.000Z',
      created_at: '2026-09-22T11:37:22.000Z',
    };
    expect(saleWallClockRaw(src)).toBe(src.created_at);
    const t = formatSaleWallClockTime(src, 'tr-TR');
    expect(t).not.toBe('15:00');
    expect(t).toMatch(/^\d{2}:\d{2}$/);
  });
});

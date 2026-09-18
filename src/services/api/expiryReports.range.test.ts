import { describe, expect, it } from 'vitest';
import {
  EXPIRY_REPORT_ALL_FUTURE,
  EXPIRY_REPORT_ALL_RECORDED,
  EXPIRY_REPORT_DEFAULT_DAYS,
  addDaysYmd,
  expiryRangeBounds,
  isExpiryYmdInRange,
  normalizeExpiryLimitDays,
} from '../../utils/expiryReportRange';

describe('expiryRangeBounds', () => {
  const today = '2026-09-18';

  it('Sonraki 30 gün: today … today+30 inclusive, future not expired', () => {
    const b = expiryRangeBounds(30, today);
    expect(b.fromYmd).toBe('2026-09-18');
    expect(b.toYmd).toBe('2026-10-18');
    expect(isExpiryYmdInRange('2026-09-17', b)).toBe(false);
    expect(isExpiryYmdInRange('2026-09-18', b)).toBe(true);
    expect(isExpiryYmdInRange('2026-10-18', b)).toBe(true);
    expect(isExpiryYmdInRange('2026-10-19', b)).toBe(false);
  });

  it('Bugün: expiry = today', () => {
    const b = expiryRangeBounds(0, today);
    expect(b.fromYmd).toBe(today);
    expect(b.toYmd).toBe(today);
    expect(isExpiryYmdInRange('2026-09-18', b)).toBe(true);
    expect(isExpiryYmdInRange('2026-09-19', b)).toBe(false);
    expect(isExpiryYmdInRange('2026-09-17', b)).toBe(false);
  });

  it('Sonraki 1 yıl: today … today+365 inclusive', () => {
    const b = expiryRangeBounds(365, today);
    expect(b.fromYmd).toBe(today);
    expect(b.toYmd).toBe(addDaysYmd(today, 365));
    expect(isExpiryYmdInRange(addDaysYmd(today, 365), b)).toBe(true);
    expect(isExpiryYmdInRange(addDaysYmd(today, 366), b)).toBe(false);
  });

  it('Tüm gelecek SKT: expiry >= today, no upper bound', () => {
    const b = expiryRangeBounds(EXPIRY_REPORT_ALL_FUTURE, today);
    expect(b.fromYmd).toBe(today);
    expect(b.toYmd).toBeNull();
    expect(isExpiryYmdInRange('2026-09-17', b)).toBe(false);
    expect(isExpiryYmdInRange('2026-09-18', b)).toBe(true);
    expect(isExpiryYmdInRange('2028-01-01', b)).toBe(true);
  });

  it('Tüm SKT (geçmiş dahil): past + future', () => {
    const b = expiryRangeBounds(EXPIRY_REPORT_ALL_RECORDED, today);
    expect(b.fromYmd).toBeNull();
    expect(b.toYmd).toBeNull();
    expect(isExpiryYmdInRange('2020-01-01', b)).toBe(true);
    expect(isExpiryYmdInRange('2026-09-18', b)).toBe(true);
    expect(isExpiryYmdInRange('2028-12-31', b)).toBe(true);
  });

  it('varsayılan gün sayısı 30', () => {
    expect(EXPIRY_REPORT_DEFAULT_DAYS).toBe(30);
    expect(normalizeExpiryLimitDays(Number.NaN)).toBe(30);
  });
});

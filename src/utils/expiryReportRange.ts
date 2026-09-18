/** -1 = tüm gelecek SKT (üst sınır yok); -2 = kayıtlı tüm SKT (geçmiş dahil); aksi halde 0…3650 gün */
export const EXPIRY_REPORT_ALL_FUTURE = -1;
export const EXPIRY_REPORT_ALL_RECORDED = -2;
/** Varsayılan: bugün … bugün+30 (dahil), henüz dolmamış SKT */
export const EXPIRY_REPORT_DEFAULT_DAYS = 30;

export interface ExpiryRangeBounds {
  /** Inclusive lower bound YYYY-MM-DD; null = no lower bound (past included) */
  fromYmd: string | null;
  /** Inclusive upper bound YYYY-MM-DD; null = no upper bound */
  toYmd: string | null;
}

export function normalizeExpiryLimitDays(daysAhead: number): number {
  const n = Math.round(Number(daysAhead));
  if (n === EXPIRY_REPORT_ALL_FUTURE || n === EXPIRY_REPORT_ALL_RECORDED) return n;
  return Math.max(0, Math.min(3650, Number.isFinite(n) ? n : EXPIRY_REPORT_DEFAULT_DAYS));
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * SKT aralık sınırı (takvim günü, dahil).
 * Sonraki N gün / Bugün: [today, today+N]
 * Tüm gelecek: [today, ∞)
 * Tüm SKT: (-∞, ∞)
 */
export function expiryRangeBounds(daysAhead: number, todayYmd: string): ExpiryRangeBounds {
  const n = normalizeExpiryLimitDays(daysAhead);
  if (n === EXPIRY_REPORT_ALL_RECORDED) return { fromYmd: null, toYmd: null };
  if (n === EXPIRY_REPORT_ALL_FUTURE) return { fromYmd: todayYmd, toYmd: null };
  return { fromYmd: todayYmd, toYmd: addDaysYmd(todayYmd, n) };
}

/** YYYY-MM-DD string karşılaştırma; sınırlar dahil. */
export function isExpiryYmdInRange(expiryYmdValue: string, bounds: ExpiryRangeBounds): boolean {
  if (!expiryYmdValue) return false;
  if (bounds.fromYmd && expiryYmdValue < bounds.fromYmd) return false;
  if (bounds.toYmd && expiryYmdValue > bounds.toYmd) return false;
  return true;
}

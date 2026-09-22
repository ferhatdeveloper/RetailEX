/**
 * Satış / fatura duvar saati.
 *
 * `sales.date` / `invoice_date` iş günü için kasıtlı `…T12:00:00` (UTC öğle) yazılır;
 * UTC+3’te her satır 15:00 görünür. Gerçek saat `created_at`’te.
 */

export type WallClockSource = {
  date?: string | null;
  created_at?: string | null;
  invoice_date?: string | null;
};

/** ISO / SQL timestamp’in iş-günü sabiti (öğle / gece) olup olmadığı. */
export function isBusinessDayClockAnchor(raw: string | Date | null | undefined): boolean {
  if (raw == null || raw === '') return false;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return false;
    return (
      raw.getUTCMinutes() === 0 &&
      raw.getUTCSeconds() === 0 &&
      raw.getUTCMilliseconds() === 0 &&
      (raw.getUTCHours() === 12 || raw.getUTCHours() === 0)
    );
  }
  const s = String(raw).trim();
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  // Yazım kalıbı: YYYY-MM-DDT12:00:00[.000][Z]? veya yerel öğle / gece
  if (/^\d{4}-\d{2}-\d{2}[T\s](?:12|00):00:00(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(s)) {
    return true;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0 &&
    (d.getUTCHours() === 12 || d.getUTCHours() === 0)
  );
}

/** Listeleme / sıralama / yazdırma için ham an (created_at tercih). */
export function saleWallClockRaw(source: WallClockSource): string {
  const created = String(source.created_at || '').trim();
  if (created && !isBusinessDayClockAnchor(created)) return created;
  if (created) return created;

  const date = String(source.date || source.invoice_date || '').trim();
  return date;
}

export function saleWallClockDate(source: WallClockSource): Date | null {
  const raw = saleWallClockRaw(source);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function saleWallClockTimestamp(source: WallClockSource): number {
  const d = saleWallClockDate(source);
  return d ? d.getTime() : 0;
}

/** Yerel saat 0–23; geçersizse null. */
export function saleWallClockHourLocal(source: WallClockSource): number | null {
  const d = saleWallClockDate(source);
  if (!d) return null;
  return d.getHours();
}

export function formatSaleWallClockTime(
  source: WallClockSource,
  locale = 'tr-TR',
): string {
  const d = saleWallClockDate(source);
  if (!d) return '—';
  // İş günü sabiti ve created_at yoksa saat gösterme
  const raw = saleWallClockRaw(source);
  if (isBusinessDayClockAnchor(raw) && !String(source.created_at || '').trim()) {
    return '—';
  }
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatSaleWallClockDateTime(
  source: WallClockSource,
  locale = 'tr-TR',
): string {
  const d = saleWallClockDate(source);
  if (!d) return '—';
  const datePart = d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const raw = saleWallClockRaw(source);
  if (isBusinessDayClockAnchor(raw) && !String(source.created_at || '').trim()) {
    return datePart;
  }
  const timePart = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}

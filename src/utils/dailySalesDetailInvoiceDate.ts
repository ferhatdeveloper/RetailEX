/**
 * Satış Detayları — Tarih kolonu.
 *
 * Kaynak satış fişinin fatura / işlem günüdür (`sale.date` / `invoice_date`).
 * Gider satırında belge günü (`expense_date` / kasa işlem günü) aynı kolona yazılır.
 * `created_at` duvar saatidir; bu kolon onu okumaz. Saat ayrı kolonda kalır.
 *
 * Biçim gün.ay.yıl (24.10.2026). Öğle çapası (`T12:00:00Z`) günü kaydırmaz.
 */
import { formatShortDate } from './dateLocale';
import { toSqlDateInputString } from './localCalendarDate';

export interface DailySalesDetailInvoiceDateSource {
  date?: string | null;
  invoiceDate?: string | null;
  invoice_date?: string | null;
  /** Duvar saati. Fatura günü için okunmaz. */
  created_at?: string | null;
  /** Duvar saati. Belge günü için okunmaz. */
  createdAt?: string | null;
  erpSale?: {
    date?: string | null;
    invoiceDate?: string | null;
    invoice_date?: string | null;
    created_at?: string | null;
  } | null;
}

function written(value: unknown): string {
  return String(value ?? '').trim();
}

function calendarKey(value: unknown): string {
  const text = written(value);
  if (!text) return '';
  return toSqlDateInputString(text);
}

/** Yazılı fatura veya belge günü (`YYYY-MM-DD`). Duvar saati yoksa boş. */
export function dailySalesDetailInvoiceDateRaw(
  source: DailySalesDetailInvoiceDateSource | null | undefined,
): string {
  if (!source) return '';
  const sale = source.erpSale;
  const candidates = [
    source.invoice_date,
    source.invoiceDate,
    sale?.invoice_date,
    sale?.invoiceDate,
    sale?.date,
    source.date,
  ];
  for (const candidate of candidates) {
    const key = calendarKey(candidate);
    if (key) return key;
  }
  return '';
}

/** Gün.ay.yıl. Saat eklenmez. Kayıt yoksa — */
export function dailySalesDetailInvoiceDateLabel(
  source: DailySalesDetailInvoiceDateSource | string | null | undefined,
): string {
  const raw = typeof source === 'string' || source == null
    ? calendarKey(source)
    : dailySalesDetailInvoiceDateRaw(source);
  if (!raw) return '—';
  const label = formatShortDate(raw);
  return label && label !== '—' ? label : '—';
}

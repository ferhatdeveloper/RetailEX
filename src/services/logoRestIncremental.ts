/**
 * Logo REST artımlı senkron — tarih/watermark ve q filtresi.
 * Tam listeyi her seferinde baştan çekmek yerine değişen / son pencereyi hedefler.
 */

import { loadLogoErpIntegrationParams } from './logoErpIntegrationParams';
import type { LogoResourceName } from './logoRestApi';

/** Kaynak bazlı son başarılı çekim (ISO) */
export type LogoPullWatermarks = Partial<Record<string, string>>;

const OVERLAP_MS = 2 * 60 * 60 * 1000; // 2 saat örtüşme — kaçan güncellemeleri yakala
const DEFAULT_DOC_DAYS_FIRST = 30;

export function formatLogoFilterDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

/** Logo REST `q` için alan>=gg.aa.yyyy */
export function buildLogoDateGteQuery(field: string, since: Date): string {
  return `${field}>=${formatLogoFilterDate(since)}`;
}

export function logoListDateField(resource: LogoResourceName | string): string {
  switch (resource) {
    case 'items':
    case 'Arps':
    case 'banks':
    case 'bankAccounts':
      return 'CAPIBLOCK_MODIFIEDDATE';
    case 'salesInvoices':
    case 'purchaseInvoices':
    case 'salesOrders':
    case 'purchaseOrders':
    case 'itemSlips':
    default:
      return 'DATE';
  }
}

/**
 * Artımlı çekim başlangıç tarihi.
 * - Tam senkron → null
 * - Son watermark varsa → watermark − örtüşme
 * - İlk çekimde belge gün sayısı (veya varsayılan 30 gün)
 */
export function resolveIncrementalSince(opts: {
  fullSync?: boolean;
  lastSyncAt?: string | null;
  documentTransferDays?: number;
  /** İlk çekimde watermark yokken belge penceresi kullan (varsayılan true) */
  useDefaultWindowWhenEmpty?: boolean;
}): Date | null {
  if (opts.fullSync) return null;

  const docDays =
    opts.documentTransferDays != null
      ? Math.max(0, opts.documentTransferDays)
      : loadLogoErpIntegrationParams().documentTransferDays;

  const now = Date.now();
  let sinceMs: number | null = null;

  if (opts.lastSyncAt) {
    const last = Date.parse(opts.lastSyncAt);
    if (Number.isFinite(last)) {
      sinceMs = last - OVERLAP_MS;
    }
  }

  if (sinceMs == null) {
    const days =
      docDays > 0 ? docDays : opts.useDefaultWindowWhenEmpty === false ? 0 : DEFAULT_DOC_DAYS_FIRST;
    if (days <= 0) return null;
    sinceMs = now - days * 86_400_000;
  } else if (docDays > 0) {
    // Belge penceresinden daha eskiye inme
    const floor = now - docDays * 86_400_000;
    if (sinceMs < floor) sinceMs = floor;
  }

  return new Date(sinceMs);
}

export function parseLogoDateToMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Logo bazen OLE date / epoch saniye verir
    if (value > 1e12) return value;
    if (value > 1e9) return value * 1000;
  }
  const s = String(value).trim();
  if (!s) return null;

  // gg.aa.yyyy veya gg/aa/yyyy
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3]);
    const hh = Number(m[4] || 0);
    const mm = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    const dt = new Date(y, mo, d, hh, mm, ss);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }

  // yyyy-mm-dd…
  const iso = Date.parse(s);
  return Number.isFinite(iso) ? iso : null;
}

/** Kayıttan değişiklik / belge tarihi (ms) */
export function logoRecordTouchMs(rec: Record<string, unknown>): number | null {
  const keys = [
    'CAPIBLOCK_MODIFIEDDATE',
    'CAPIBLOCK_CREADEDDATE',
    'DATE_MODIFIED',
    'MODIFIED_DATE',
    'LAST_UPDATE',
    'DATE',
    'DATE_',
    'DOC_DATE',
    'date',
    'FICHEDATE',
  ];
  for (const k of keys) {
    if (k in rec) {
      const ms = parseLogoDateToMs(rec[k]);
      if (ms != null) return ms;
    }
  }
  return null;
}

export function filterLogoRecordsSince<T>(
  items: T[],
  since: Date | null,
  unwrap: (raw: T) => Record<string, unknown>,
): T[] {
  if (!since) return items;
  const sinceMs = since.getTime();
  return items.filter((raw) => {
    const rec = unwrap(raw);
    const touch = logoRecordTouchMs(rec);
    // Tarih yoksa artımlıda atlama — aksi halde yine tüm kartlar gelir
    if (touch == null) return false;
    return touch >= sinceMs;
  });
}

export function describeIncrementalWindow(since: Date | null, fullSync: boolean): string {
  if (fullSync || !since) return 'Tam senkron (tüm kayıtlar)';
  return `Artımlı: ${formatLogoFilterDate(since)} itibarıyla değişen / yeni kayıtlar`;
}

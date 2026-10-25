/**
 * Günlük rapor Satış Detayları — dönem fiş listesi.
 *
 * Seçilen gündeki her fiş bir kez durur. Yeni fiş eklenince eskisi düşmez.
 * Müşteri anahtarı veya fiş numarası eski satırı ezmez. Sabit satır sayısı yoktur.
 *
 * Dip toplam listedeki bütün satırların bir kez toplamıdır; son N veya
 * görünen sayfa değil. İade eksi ve bir kez. İndirim satırda düşülmüşse
 * nete eklenmez ve açık cari sayılmaz. Kapanmış randevunun peşinatı ile
 * mahsup avans nete ikinci kez girmez. İade edilmeyen iptal peşinatı bir kez girer.
 */
import type { Sale } from '../core/types/models';
import { sumDailySalesDetailCashBalance } from './dailySalesDetailCashBalance';

export type DailySalesDetailKindFilter = 'all' | 'service' | 'product' | 'reservation';

export interface DailySalesDetailListRow {
  id?: string | null;
  isAvans?: boolean;
  isForfeitedDeposit?: boolean;
}

/** Sorgu penceresi bir gün genişler. Yerel gün süzgeci asıl aralığı keser. */
export function widenDailyReportQueryRange(
  from: string,
  to: string,
): { from: string; to: string } {
  return {
    from: shiftCivilDateKey(from, -1),
    to: shiftCivilDateKey(to, 1),
  };
}

function shiftCivilDateKey(raw: string, days: number): string {
  const text = String(raw ?? '').trim().slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Aynı kimlik bir kez. Boş kimlik düşmez.
 * Fiş numarası ve müşteri bu haritada anahtar değildir.
 */
export function assembleDailySalesDetailRows<T extends { id?: string | null }>(
  fiches: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const fiche of fiches) {
    const id = String(fiche?.id ?? '').trim();
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(fiche);
  }
  return out;
}

function receiptKey(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text || text === '—' || text === '-') return '';
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) out += String.fromCharCode(code + 32);
    else out += ch;
  }
  return out;
}

function beautySaleIdFromNotes(notes: unknown): string {
  const match = String(notes ?? '').match(
    /beauty_sale_id:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match?.[1] ? match[1].toLowerCase() : '';
}

export interface DailyPeriodFicheIdentity {
  id?: string | null;
  receiptNumber?: string | null;
  notes?: string | null;
}

/**
 * ERP fişleri durur. Aynı fişin güzellik kopyası eklenmez ve ilkinin tutarını değiştirmez.
 * Farklı fiş numarası ve farklı kimlik her zaman eklenir.
 */
export function mergeUnmirroredPeriodFiches<T extends DailyPeriodFicheIdentity>(
  primary: readonly T[],
  extras: readonly T[],
): T[] {
  const ids = new Set<string>();
  const receipts = new Set<string>();
  const mirroredBeautyIds = new Set<string>();
  for (const row of primary) {
    const id = String(row.id ?? '').trim();
    if (id) ids.add(id);
    const receipt = receiptKey(row.receiptNumber);
    if (receipt) receipts.add(receipt);
    const beautyId = beautySaleIdFromNotes(row.notes);
    if (beautyId) mirroredBeautyIds.add(beautyId);
  }
  const out = primary.slice();
  for (const extra of extras) {
    const id = String(extra.id ?? '').trim();
    if (id && (ids.has(id) || mirroredBeautyIds.has(id))) continue;
    const receipt = receiptKey(extra.receiptNumber);
    if (receipt && receipts.has(receipt)) continue;
    out.push(extra);
    if (id) ids.add(id);
    if (receipt) receipts.add(receipt);
  }
  return out;
}

/**
 * Tümü: dönem fişlerinin hepsi, avans ve iptal peşinatı dahil.
 * Hizmet / Ürün: avans ve iptal peşinatı bu sekmeye girmez.
 * Rezervasyon: yalnız avans ve iptal peşinatı.
 */
export function passesDailySalesDetailList(
  row: DailySalesDetailListRow,
  filter: DailySalesDetailKindFilter,
): boolean {
  const avans = row.isAvans === true || row.isForfeitedDeposit === true;
  if (filter === 'reservation') return avans;
  if (avans) return filter === 'all';
  return true;
}

export function filterDailySalesDetailRows<T extends DailySalesDetailListRow>(
  rows: readonly T[],
  filter: DailySalesDetailKindFilter,
): T[] {
  const kept: T[] = [];
  for (const row of rows) {
    if (passesDailySalesDetailList(row, filter)) kept.push(row);
  }
  return kept;
}

/** Dip toplam. Sayfa dilimi yok. Mahsup avans ve kapanmış peşinat 0. İade eksi bir kez. */
export function sumListedDailySalesDetailFooter<T extends Parameters<typeof sumDailySalesDetailCashBalance>[0][number]>(
  rows: readonly T[],
): number {
  return sumDailySalesDetailCashBalance(rows);
}

export interface BeautyPeriodFicheInput {
  id?: string | null;
  invoice_number?: string | null;
  receiptNumber?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customerName?: string | null;
  subtotal?: number | string | null;
  discount?: number | string | null;
  tax?: number | string | null;
  total?: number | string | null;
  payment_method?: string | null;
  paymentMethod?: string | null;
  payment_status?: string | null;
  notes?: string | null;
  created_at?: string | null;
  date?: string | null;
  is_deposit?: boolean | null;
  isDeposit?: boolean | null;
}

/** İptal edilmiş güzellik fişi listeye girmez. Sağlam fiş satış kaydına döner. */
export function beautyPeriodFicheToSale(row: BeautyPeriodFicheInput): Sale | null {
  const id = String(row.id ?? '').trim();
  if (!id) return null;
  const paymentStatus = String(row.payment_status ?? '').trim().toLowerCase();
  if (paymentStatus === 'cancelled' || paymentStatus === 'canceled' || paymentStatus === 'void') {
    return null;
  }
  const discount = Math.abs(Number(row.discount) || 0);
  const subtotal = Number(row.subtotal) || 0;
  const total = Number(row.total) || 0;
  const gross = subtotal > 0 ? subtotal : total + (total < 0 ? -discount : discount);
  const signedGross = total < 0 || subtotal < 0 ? -Math.abs(gross) : gross;
  return {
    id,
    receiptNumber: String(row.invoice_number || row.receiptNumber || '').trim(),
    date: String(row.created_at || row.date || ''),
    customerId: row.customer_id ? String(row.customer_id) : undefined,
    customerName: String(row.customer_name || row.customerName || '').trim() || undefined,
    items: [],
    subtotal: signedGross,
    discount,
    tax: Number(row.tax) || 0,
    total: signedGross,
    paymentMethod: String(row.payment_method || row.paymentMethod || 'cash'),
    status: signedGross < 0 ? 'return' : 'completed',
    notes: row.notes ? String(row.notes) : undefined,
    isDeposit: row.is_deposit === true || row.isDeposit === true,
  } as Sale;
}

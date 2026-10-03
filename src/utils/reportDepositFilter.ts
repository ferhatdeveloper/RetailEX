/**
 * Bug 24 — Günlük Rapor + Müşteri Satış Analizi peşinat filtresi.
 *
 * Randevuya bağlı peşinat fişleri (`is_deposit === true` veya
 * `payment_status` pending/awaiting_service) henüz hizmet verilmemiş
 * avanslardır. Bunların ciro / veresiye / satış adedi toplamlarına
 * dahil EDİLMEMELİ; yalnızca kasa tahsilatı (cash_lines / paid_amount)
 * bakiyesinde yer almalıdır. Ana satış fişi hizmet tamamlandığında
 * ayrı bir `is_deposit = false` kaydı olarak oluşur; asıl ciro o fişten
 * sayılır.
 *
 * Bu dosya **saf fonksiyonlar** içerir; React bileşeni import etmeden
 * vitest ile doğrudan test edilebilir (Bug 21 deseni).
 *
 * Kapsam:
 *  - `isCiroyaDahilSale`         Ciro / Veresiye / Adet filtresi
 *  - `isKasaTahsilatiSale`       Kasa / TAHSİL EDİLEN filtresi
 *  - `filterForRevenue`          useMemo için liste (ciro/veresiye)
 *  - `filterForCash`             useMemo için liste (kasa/collected)
 */

import type { Sale } from '../core/types';

const CANCELLED_STATUSES = new Set([
  'cancelled',
  'canceled',
  'refunded',
  'void',
  'iptal',
  'silindi',
  'deleted',
]);

const PENDING_PAYMENT_STATUSES = new Set([
  'pending',
  'awaiting_service',
  'partial',
]);

/**
 * Sale durumu iptal / iade mi? (Bug 12 devamı ile uyumlu).
 * `status` alanı boş ise false döner (eski veriler için geriye dönük uyum).
 */
export function isRemovedSaleStatusLite(status: unknown): boolean {
  const st = String(status ?? '').trim().toLowerCase();
  if (!st) return false;
  return CANCELLED_STATUSES.has(st);
}

/**
 * `payment_status` iptal / iade / void mu?
 * `payment_status` boş ise false döner (geriye dönük uyum).
 */
export function isCancelledPaymentStatus(paymentStatus: unknown): boolean {
  const st = String(paymentStatus ?? '').trim().toLowerCase();
  if (!st) return false;
  return CANCELLED_STATUSES.has(st);
}

/**
 * `payment_status` henüz hizmet verilmemiş (peşinat beklemede) mi?
 * `partial` da Hariç tutulur: kısmi ödeme zaten hizmet verilmiş bir
 * fiş; ancak Bug 23'te bu değer Hariç tutulmuş ve satır `total` ciroya
 * eklenmemesi için `dailySalesActive` dışında tutulmuştur.
 */
export function isPendingPaymentStatus(paymentStatus: unknown): boolean {
  const st = String(paymentStatus ?? '').trim().toLowerCase();
  if (!st) return false;
  return PENDING_PAYMENT_STATUSES.has(st);
}

/**
 * Bu satış bir randevuya bağlı peşinat fişi mi?
 * DB'de `sales.is_deposit = true` yazılır (Migration 182).
 * Frontend `Sale.isDeposit` alanı `mapInvoiceToSale` tarafından set edilir.
 */
export function isDepositSale(sale: Partial<Sale> | null | undefined): boolean {
  return Boolean((sale as { isDeposit?: boolean | null } | null | undefined)?.isDeposit === true);
}

/**
 * Ciro / Veresiye / Adet toplamlarına dahil edilecek satış mı?
 *
 * Hariç tutulanlar:
 *  - İptal / iade (`status` veya `payment_status` cancelled/refunded/...)
 *  - Henüz hizmet verilmemiş (`payment_status` pending/awaiting_service/partial)
 *  - Peşinat fişi (`is_deposit === true` — Bug 24)
 *
 * Kasa / TAHSİL EDİLEN tahsilatı için bu fonksiyon KULLANILMAZ;
 * orada yalnızca iptal Hariç tutulur, peşinat dahil edilir.
 */
export function isCiroyaDahilSale(sale: Partial<Sale> | null | undefined): boolean {
  if (!sale) return false;
  if (isRemovedSaleStatusLite((sale as Sale).status)) return false;
  const ps = (sale as Sale & { payment_status?: string }).payment_status;
  if (isCancelledPaymentStatus(ps) || isPendingPaymentStatus(ps)) return false;
  if (isDepositSale(sale)) return false;
  return true;
}

/**
 * Kasa / TAHSİL EDİLEN toplamlarına dahil edilecek satış mı?
 *
 * Hariç tutulanlar:
 *  - İptal / iade (`status` veya `payment_status` cancelled/refunded/...)
 *
 * Dahil edilenler:
 *  - Peşinat fişi (`is_deposit === true`): tahsil edilen nakit zaten
 *    kasaya girmiştir (cash_lines / saleCollectedSplit.paid).
 *  - `payment_status` pending: bu durumda `saleCollectedSplit` zaten
 *    sıfır döner; dahil etmek/etmemek sonucu değiştirmez ama explicit
 *    Hariç tutmuyoruz.
 */
export function isKasaTahsilatiSale(sale: Partial<Sale> | null | undefined): boolean {
  if (!sale) return false;
  if (isRemovedSaleStatusLite((sale as Sale).status)) return false;
  const ps = (sale as Sale & { payment_status?: string }).payment_status;
  if (isCancelledPaymentStatus(ps)) return false;
  return true;
}

/**
 * Liste filtresi — Ciro / Veresiye / Adet.
 */
export function filterForRevenue<T extends Partial<Sale>>(sales: readonly T[]): T[] {
  return (Array.isArray(sales) ? sales : []).filter(isCiroyaDahilSale);
}

/**
 * Liste filtresi — Kasa / TAHSİL EDİLEN.
 */
export function filterForCash<T extends Partial<Sale>>(sales: readonly T[]): T[] {
  return (Array.isArray(sales) ? sales : []).filter(isKasaTahsilatiSale);
}

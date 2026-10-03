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
 * Yalnızca peşinat fişleri (`is_deposit === true`). Randevuya bağlı avanslar
 * brüt satış adedine ve ciroya DAHİL EDİLMEZ, ancak ayrı bir "Peşinat" kartında
 * gösterilir (kullanıcı isteği Bug 28).
 */
export function isDepositOnlySale(sale: Partial<Sale> | null | undefined): boolean {
    if (!sale) return false;
    if (isRemovedSaleStatusLite((sale as Sale).status)) return false;
    return isDepositSale(sale);
}

export function filterForDeposit<T extends Partial<Sale>>(sales: readonly T[]): T[] {
    return (Array.isArray(sales) ? sales : []).filter(isDepositOnlySale);
}

/**
 * Yalnızca ANA fişler — peşinat Hariç, tamamlanmış ciro. `filterForRevenue`
 * ile aynı sonucu verir (peşinat zaten orada Hariç) fakat adlandırma
 * niyeti için ayrı fonksiyon.
 */
export function isMainFinishedSale(sale: Partial<Sale> | null | undefined): boolean {
    return isCiroyaDahilSale(sale);
}

export function filterForMain<T extends Partial<Sale>>(sales: readonly T[]): T[] {
    return (Array.isArray(sales) ? sales : []).filter(isMainFinishedSale);
}

/**
 * Liste filtresi — Kasa / TAHSİL EDİLEN.
 */
export function filterForCash<T extends Partial<Sale>>(sales: readonly T[]): T[] {
    return (Array.isArray(sales) ? sales : []).filter(isKasaTahsilatiSale);
}

/* =========================================================================
 *  BUG 26 — Randevu status filtresi (tamamlanmamış raporlara yansımasın)
 *  - Hizmet Bazlı Rapor, Personel Shot/Derece raporu ve diğer
 *    appointment-bazlı raporlar yalnızca `status = 'completed'` olanları
 *    raporlar; tamamlanmamış (scheduled/confirmed/pre_paid/in_progress)
 *    satırlar ciro/performans verisine dahil edilmez.
 *  - `beautyService.getAppointmentsInRange` zaten server-side
 *    `status = 'completed'` filtresi uygular; bu fonksiyon client-side
 *    savunma katmanı + veri paylaşan diğer modüllerde (CRM, dashboard
 *    beklenti) tek doğruluk noktasıdır.
 *  ========================================================================= */

const COMPLETED_APPOINTMENT_STATUSES = new Set(['completed', 'done', 'finished', 'tamamlandi', 'tamamlandı']);

const OPEN_APPOINTMENT_STATUSES = new Set([
    'scheduled',
    'confirmed',
    'pre_paid',
    'in_progress',
    'pending',
    'awaiting_service',
    'no_show',
    'cancelled',
    'canceled',
    'refunded',
    'void',
]);

/**
 * Randevu hizmet verilmiş mi? (`status` completed/done/tamamlandı vb.)
 * Boş status → false (geriye dönük uyum).
 */
export function isCompletedAppointmentStatus(status: unknown): boolean {
    const st = String(status ?? '').trim().toLowerCase();
    if (!st) return false;
    return COMPLETED_APPOINTMENT_STATUSES.has(st);
}

/**
 * Randevu henüz tamamlanmamış mı? (scheduled/confirmed/pre_paid/in_progress
 * ve iptal/no_show). `cancelled` zaten rapora girmiyor; buradaki yardımcı
 * fonksiyon ciro + performans raporları için "açık iş" filtresidir.
 */
export function isOpenAppointmentStatus(status: unknown): boolean {
    const st = String(status ?? '').trim().toLowerCase();
    if (!st) return true; // boş status → tamamlanmamış kabul et
    if (COMPLETED_APPOINTMENT_STATUSES.has(st)) return false;
    return OPEN_APPOINTMENT_STATUSES.has(st) || true; // bilinmeyen status → açık iş
}

/**
 * Generic randevu objesinden status çekip `isCompletedAppointmentStatus`
 * ile karşılaştırır. Tüm `BeautyAppointment` benzeri objelere uyar.
 */
export function appointmentStatusIsCompleted(appointment: { status?: string | null } | null | undefined): boolean {
    if (!appointment) return false;
    return isCompletedAppointmentStatus(appointment.status);
}

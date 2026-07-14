/**
 * Web `src/utils/paymentMethodUtils.ts` + invoices.paymentMethodImpliesCashInKasa
 * ile uyumlu dar yardımcı set — mobil create path yan etkileri için.
 */

/** Veresiye / açık hesap → müşteri borcu artar */
export function paymentMethodImpliesCustomerDebt(pm: string | undefined | null): boolean {
  const p = String(pm || '').toLowerCase().trim();
  if (!p) return false;
  if (
    p === 'veresiye' ||
    p === 'open_account' ||
    p === 'acik_cari' ||
    p === 'açık_cari' ||
    p === 'cari' ||
    p === 'açık hesap' ||
    p === 'acik hesap' ||
    p === 'açık cari' ||
    p === 'acik cari'
  ) {
    return true;
  }
  return p.includes('veresiye');
}

/** Peşin nakit/kart/havale değilse tedarikçi borcu artar (boş ödeme → borç) */
export function paymentMethodImpliesSupplierDebt(pm: string | undefined | null): boolean {
  const p = String(pm || '').toLowerCase().trim();
  if (!p) return true;
  if (paymentMethodImpliesPaidNow(pm)) return false;
  if (p === 'havale' || p === 'eft' || p === 'haval' || p === 'transfer') return false;
  return true;
}

/** Anında tahsil edilen (nakit / kart) */
export function paymentMethodImpliesPaidNow(pm: string | undefined | null): boolean {
  const p = String(pm || '').toLowerCase().trim();
  if (!p) return false;
  if (paymentMethodImpliesCustomerDebt(pm)) return false;
  return (
    p === 'cash' ||
    p === 'nakit' ||
    p === 'card' ||
    p === 'kart' ||
    p === 'credit_card' ||
    p === 'pos' ||
    p === 'gateway' ||
    p.includes('kredi') ||
    p.includes('kart')
  );
}

/**
 * POS / satış: kasa defterine KASA_GIRIS yazılmalı mı.
 * Web POS saf nakit için yazar; mobil audit (R8) nakit + kart ister.
 */
export function paymentMethodImpliesCashInKasa(pm: string | undefined | null): boolean {
  return paymentMethodImpliesPaidNow(pm);
}

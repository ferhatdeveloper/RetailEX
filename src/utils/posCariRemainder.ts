/**
 * POS “kalanı cariye” — saf eşik / veresiye satırı.
 * React modalını test etmemek için buraya çıkarıldı.
 */
import { roundPosMoneyAmount } from './discountRounding';

/** Kalan tutar eşiği — müşteri varsa cariye yazılabilir. */
export const POS_CARI_REMAINING_THRESHOLD = 0.009;

export type PosCariCurrency = 'IQD' | 'USD' | 'EUR';

export type PosVeresiyeCashRegister = {
  id?: string;
  kasa_adi?: string;
  kasa_kodu?: string;
};

export type PosVeresiyePaymentRow = {
  method: 'veresiye';
  amount: number;
  currency: PosCariCurrency;
};

export function hasPosCariRemainder(
  remaining: number,
  threshold = POS_CARI_REMAINING_THRESHOLD,
): boolean {
  return Number(remaining) > threshold;
}

/**
 * Kalan tutarı yuvarlanmış veresiye (cari) satırına çevirir.
 * Veresiye kasa hareketi değildir — kasa adı/id eklenmez (etiket: Veresiye/Cari).
 */
export function buildVeresiyeForRemaining(
  amount: number,
  currency: PosCariCurrency,
  _cashRegister?: PosVeresiyeCashRegister | null,
): PosVeresiyePaymentRow {
  return {
    method: 'veresiye',
    amount: roundPosMoneyAmount(amount, currency),
    currency,
  };
}

/**
 * Onay anı: kalan eşikten büyükse ve müşteri seçiliyse veresiye satırı ekler.
 * Müşteri yoksa satır eklenmez (modal uyarı verir).
 */
export function appendVeresiyeForRemaining<T extends { method: string; amount: number }>(
  payments: T[],
  remaining: number,
  opts: {
    hasCustomer: boolean;
    currency: PosCariCurrency;
    /** Geriye uyum — veresiye satırına yazılmaz */
    cashRegister?: PosVeresiyeCashRegister | null;
    threshold?: number;
  },
): { payments: Array<T | PosVeresiyePaymentRow>; remaining: number; appended: boolean } {
  const threshold = opts.threshold ?? POS_CARI_REMAINING_THRESHOLD;
  if (!hasPosCariRemainder(remaining, threshold)) {
    return { payments: [...payments], remaining: remaining > 0 ? remaining : 0, appended: false };
  }
  if (!opts.hasCustomer) {
    return { payments: [...payments], remaining, appended: false };
  }
  return {
    payments: [...payments, buildVeresiyeForRemaining(remaining, opts.currency)],
    remaining: 0,
    appended: true,
  };
}

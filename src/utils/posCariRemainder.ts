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
  cash_register_id?: string;
  cash_register_name?: string;
  cash_register_code?: string;
};

export function hasPosCariRemainder(
  remaining: number,
  threshold = POS_CARI_REMAINING_THRESHOLD,
): boolean {
  return Number(remaining) > threshold;
}

/** Kalan tutarı yuvarlanmış veresiye (cari) satırına çevirir. */
export function buildVeresiyeForRemaining(
  amount: number,
  currency: PosCariCurrency,
  cashRegister?: PosVeresiyeCashRegister | null,
): PosVeresiyePaymentRow {
  const row: PosVeresiyePaymentRow = {
    method: 'veresiye',
    amount: roundPosMoneyAmount(amount, currency),
    currency,
  };
  if (cashRegister?.id) {
    row.cash_register_id = cashRegister.id;
    if (cashRegister.kasa_adi) row.cash_register_name = cashRegister.kasa_adi;
    if (cashRegister.kasa_kodu) row.cash_register_code = cashRegister.kasa_kodu;
  }
  return row;
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
    payments: [...payments, buildVeresiyeForRemaining(remaining, opts.currency, opts.cashRegister)],
    remaining: 0,
    appended: true,
  };
}

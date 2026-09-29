/**
 * POS "Peşinatlı Satış" — saf hesap / dönüşüm fonksiyonları.
 *
 * Türk muhasebesinde "peşinatlı satış" = kaporalı/taksitli satış:
 *  - Müşteri bir kısmını (genelde ilk taksit = peşinat/kapora) anında öder,
 *  - kalan tutar taksit planına bağlanır ve cariye yazılır.
 *
 * Bu modül:
 *  - DB'ye / payment satırına yazılacak satırları kurar
 *  - İlk taksit tutarını taksit sayısına göre yuvarlar
 *  - "Kalan tutarı veresiye olarak ekle" adımında taksit planı
 *    metadata'sını ilk veresiye satırına iliştirir
 *
 * NOT: Zamanlayıcı, otomatik tahsilat veya `installment_plans` tablosu
 * bu aşamada YOK — ilk taksit peşin tahsil edilir, kalan için tek bir
 * veresiye satırı + metadata yazılır. Gelecekte ayrı plan tablosu
 * eklenebilir; o zaman `installments` alanı zaten hazır.
 */
import { roundPosMoneyAmount } from './discountRounding';

export type PosPesinatliCurrency = 'IQD' | 'USD' | 'EUR';

/** Satış başına izin verilen taksit sayısı seçenekleri. */
export const PESINATLI_INSTALLMENT_OPTIONS = [3, 6, 9, 12] as const;
export type PesinatliInstallments = (typeof PESINATLI_INSTALLMENT_OPTIONS)[number];

export type PosPesinatliPaymentRow = {
  /** İlk taksit tahsilatı — peşin, kasaya yansır */
  method: 'cash' | 'card' | 'pesinatli';
  amount: number;
  currency: PosPesinatliCurrency;
  /** Taksit planı (3/6/9/12) — sadece method === 'pesinatli' satırında anlamlı */
  installments?: number;
  cash_register_id?: string | null;
  cash_register_name?: string | null;
  cash_register_code?: string | null;
};

export type PosPesinatliVeresiyeRow = {
  method: 'veresiye';
  amount: number;
  currency: PosPesinatliCurrency;
  /** Taksit planı (3/6/9/12) — kalan tutar bu kadar taksite bölünecek */
  installments?: number;
  /** Taksit başına tahmini tutar (yuvarlanmış) */
  installment_amount?: number;
  cash_register_id?: string | null;
  cash_register_name?: string | null;
  cash_register_code?: string | null;
};

/**
 * Verilen tutarı seçilen taksit sayısına böler ve para birimine göre yuvarlar.
 * Taksit başına tutar para üstü / eksik kalmayacak şekilde taban tutarı döndürür;
 * son taksitte küsur birikebilir (muhasebeci gözüyle doğru olan budur).
 */
export function calculatePesinatliInstallmentAmount(
  totalRemaining: number,
  installments: number,
  currency: PosPesinatliCurrency = 'IQD',
): number {
  if (!Number.isFinite(totalRemaining) || totalRemaining <= 0) return 0;
  if (!Number.isFinite(installments) || installments <= 0) return 0;
  return roundPosMoneyAmount(totalRemaining / installments, currency);
}

/**
 * Taksit planı seçili mi? (3/6/9/12)
 */
export function isValidPesinatliInstallments(value: unknown): value is PesinatliInstallments {
  const n = Number(value);
  return Number.isFinite(n) && PESINATLI_INSTALLMENT_OPTIONS.includes(n as PesinatliInstallments);
}

/**
 * "Peşinatlı Satış" ilk taksit satırını üretir.
 *  - Tahsilat anında kasaya yansımalı
 *  - paymentMethodImpliesPaidNow('pesinatli') === true olmalı (cash/card gibi)
 *  - `paymentMethodImpliesCustomerDebt('pesinatli') === false` olmalı (peşin)
 *
 * amount: ilk taksit tutarı (müşteri el ile girebilir veya otomatik
 *         `calculatePesinatliInstallmentAmount` ile hesaplanabilir).
 */
export function buildPesinatliPayment(args: {
  amount: number;
  installments: PesinatliInstallments;
  currency: PosPesinatliCurrency;
  cashRegister?: {
    id?: string | null;
    kasa_adi?: string | null;
    kasa_kodu?: string | null;
  } | null;
}): PosPesinatliPaymentRow {
  const { amount, installments, currency, cashRegister } = args;
  const amt = Number.isFinite(amount) && amount > 0 ? roundPosMoneyAmount(amount, currency) : 0;
  return {
    method: 'pesinatli',
    amount: amt,
    currency,
    installments,
    cash_register_id: cashRegister?.id ?? null,
    cash_register_name: cashRegister?.kasa_adi ?? null,
    cash_register_code: cashRegister?.kasa_kodu ?? null,
  };
}

/**
 * Kalan tutarı veresiye satırına çevirirken taksit planı metadata'sı ekler.
 * Tek satırlık veresiye + `installments` alanı; muhasebe/cari tarafında
 * "peşinatlı" ayrımı burada yapılır (CH_TAHSILAT yazılmaz, cari borç
 * artırılır — `sales.ts` `paymentMethodImpliesCustomerDebt` true varsayar).
 *
 * İleride `installment_plans` tablosu eklenirse bu helper genişletilir:
 * burada üretilen satır + N ayrı plan satırı yazılır.
 */
export function buildPesinatliVeresiye(args: {
  amount: number;
  installments: PesinatliInstallments;
  currency: PosPesinatliCurrency;
}): PosPesinatliVeresiyeRow {
  const { amount, installments, currency } = args;
  const amt = Number.isFinite(amount) && amount > 0 ? roundPosMoneyAmount(amount, currency) : 0;
  return {
    method: 'veresiye',
    amount: amt,
    currency,
    installments,
    installment_amount: calculatePesinatliInstallmentAmount(amt, installments, currency),
  };
}

/**
 * Onay anı: kalan tutarı peşinatlı veresiye satırına çevirir.
 * Müşteri yoksa / kalan eşik altındaysa mevcut `appendVeresiyeForRemaining`
 * ile aynı semantik — boş döndürür.
 *
 * Tek fark: installments metadata'sı veresiye satırına eklenir.
 */
export function appendPesinatliVeresiyeForRemaining<
  T extends { method: string; amount: number },
>(
  payments: T[],
  remaining: number,
  opts: {
    hasCustomer: boolean;
    currency: PosPesinatliCurrency;
    installments: PesinatliInstallments;
  },
): { payments: Array<T | PosPesinatliVeresiyeRow>; remaining: number; appended: boolean } {
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { payments: [...payments], remaining: 0, appended: false };
  }
  if (!opts.hasCustomer) {
    return { payments: [...payments], remaining, appended: false };
  }
  return {
    payments: [...payments, buildPesinatliVeresiye({
      amount: remaining,
      installments: opts.installments,
      currency: opts.currency,
    })],
    remaining: 0,
    appended: true,
  };
}

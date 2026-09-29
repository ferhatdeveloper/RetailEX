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
import { roundPosMoneyAmount, posMoneyEpsilon } from './discountRounding';

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
  /**
   * Taksit planı (3/6/9/12). Yeni "serbest tutar" UX'inde kullanıcı taksit
   * sayısı seçmiyor; burada opsiyonel. Verilirse peşinat satırına da
   * metadata olarak yazılır (ileride `installment_plans` tablosu için).
   */
  installments?: PesinatliInstallments;
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

/**
 * Yeni UX (sade): "bugün bir kısım + sonraki geldiğinde kalan" modeli.
 *
 * Kullanıcı bugün ödeyeceği tutarı serbest girer. Bu helper:
 *   1) İlk satır: peşinat (`method: 'pesinatli'`, kasaya yansır).
 *   2) Kalan satır: veresiye (`method: 'veresiye'`, cari borç).
 *
 * Taksit sayısı (3/6/9/12) bu yeni akışta bilgi amaçlı; opsiyonel
 * `installments` alanı veresiye satırına iliştirilir (geriye dönük uyum).
 * Taksit sayısı verilmezse sadece iki satır (peşinat + veresiye) üretilir.
 *
 * Hata koşulları (muhasebeci gözüyle):
 *   - `totalAmount <= 0` → işlem anlamsız; throw.
 *   - `payNow <= 0` → müşteri hiçbir şey ödemedi → "peşinatlı" değil,
 *     düz veresiye akışına düşmesi gerekir; burada throw.
 *   - `payNow > totalAmount` → ödeme tutarı sepeti aşamaz; throw.
 */
export function buildPesinatliPayments(args: {
  totalAmount: number;
  payNow: number;
  currency?: PosPesinatliCurrency;
  installments?: PesinatliInstallments | null;
  cashRegister?: {
    id?: string | null;
    kasa_adi?: string | null;
    kasa_kodu?: string | null;
  } | null;
}): Array<PosPesinatliPaymentRow | PosPesinatliVeresiyeRow> {
  const total = Number(args.totalAmount);
  const pay = Number(args.payNow);
  const currency: PosPesinatliCurrency = args.currency ?? 'IQD';

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('Peşinatlı satış: sepet toplamı pozitif olmalı.');
  }
  if (!Number.isFinite(pay) || pay <= 0) {
    throw new Error('Peşinatlı satış: bugün ödenecek tutar pozitif olmalı.');
  }
  if (pay > total + posMoneyEpsilon()) {
    throw new Error('Peşinatlı satış: bugün ödenen tutar sepet toplamından büyük olamaz.');
  }

  const pesinat = buildPesinatliPayment({
    amount: pay,
    // Peşinat satırında `installments` metadata'sı artık set edilmiyor —
    // önceki turda taksit seçim UI'sı kaldırıldı; rozet/badget yanlış
    // şekilde "· 3 ay" gösteriyordu. İleride `installment_plans` tablosu
    // eklenirse burada geri set edilebilir.
    installments: undefined,
    currency,
    cashRegister: args.cashRegister ?? null,
  });

  const kalanRaw = total - pay;
  const payments: Array<PosPesinatliPaymentRow | PosPesinatliVeresiyeRow> = [pesinat];

  // Eşik altındaki kalan (yuvarlama farkı) yazılmaz — 0.01 IQD bakiye oluşturmaz.
  if (kalanRaw > 0.01) {
    const kalan = roundPosMoneyAmount(kalanRaw, currency);
    const installments = args.installments ?? null;
    if (installments != null && isValidPesinatliInstallments(installments)) {
      payments.push(buildPesinatliVeresiye({
        amount: kalan,
        installments,
        currency,
      }));
    } else {
      payments.push({
        method: 'veresiye',
        amount: kalan,
        currency,
        installments: undefined,
        installment_amount: undefined,
      });
    }
  }

  return payments;
}

/**
 * Otomatik öneri: serbest tutar alanı için default değer.
 * Yeni UX'te "bugün ödenecek" default = kalan sepet tutarı. Kullanıcı
 * isterse küçültebilir (kalan cariye yazılır).
 */
export function suggestPesinatliPayNow(remaining: number): number {
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  return remaining;
}

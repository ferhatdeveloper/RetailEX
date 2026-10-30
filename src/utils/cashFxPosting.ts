/**
 * Maaş, gider, cari ve ortak hesap için kasa dövizi.
 *
 * Kur hesabı müşteri tahsilatı ile aynıdır: `convertCashAmountToLedger`
 * (tutar × belge→hedef kuru). İkinci bir kur formülü yoktur.
 *
 * - Kasa hareketi: girilen tutar, kasanın para biriminde kalır.
 * - Rapor (ana para, örn. USD): yalnız kur biliniyorsa veya birimler aynıysa.
 * - Kur yoksa ve birimler farklıysa karşılık boştur; yabancı tutar ana para diye yazılmaz.
 */

import { convertCashAmountToLedger, parsePositiveAmount } from './cashLineFx';

export function normalizeFxCurrency(code: string | null | undefined): string {
  return String(code || '').trim().toUpperCase();
}

/** Çapraz kur olarak kullanılabilir mi? 0, NaN ve boş sayılmaz. */
export function isUsableDocumentRate(rate: number | null | undefined): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}

function cleanProduct(amount: number, rate: number): number {
  const raw = convertCashAmountToLedger(amount, rate);
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 1e6) / 1e6;
}

export type CashFxPosting = {
  /** Kasaya yazılan tutar — çevrilmez. */
  cashAmount: number;
  cashCurrency: string;
  /**
   * cash_lines.exchange_rate: 1 kasa birimi → kaç ana para.
   * Çapraz ve kur yoksa null (varsayılan 1 uydurulmaz).
   */
  exchangeRate: number | null;
  /** Ana para karşılığı. Kur yoksa null. */
  baseAmount: number | null;
  /**
   * Hesaba (maaş borcu, cari, ortak) yazılacak tutar, hesap para biriminde.
   * Çapraz ve kur yoksa null — yabancı sayı hesaba eklenmez.
   */
  accountAmount: number | null;
};

/**
 * Kasa tutarını olduğu gibi bırakır.
 * Ana para ve hesap tutarı `convertCashAmountToLedger` ile gelir.
 */
export function postCashAgainstAccount(input: {
  cashAmount: number;
  cashCurrency: string;
  baseCurrency: string;
  accountCurrency: string;
  /** 1 kasa birimi → kaç ana para. Müşteri tahsilatındaki documentToLedger. */
  documentToBaseRate: number | null;
  /** 1 kasa birimi → kaç hesap birimi. Aynı quote.documentToLedger, hedef hesap birimi. */
  documentToAccountRate: number | null;
}): CashFxPosting {
  const cashAmount = parsePositiveAmount(input.cashAmount);
  const cashCurrency = normalizeFxCurrency(input.cashCurrency);
  const baseCurrency = normalizeFxCurrency(input.baseCurrency);
  const accountCurrency = normalizeFxCurrency(input.accountCurrency);

  let exchangeRate: number | null = null;
  let baseAmount: number | null = null;
  if (cashCurrency && baseCurrency && cashCurrency === baseCurrency) {
    exchangeRate = 1;
    baseAmount = cashAmount;
  } else if (isUsableDocumentRate(input.documentToBaseRate)) {
    exchangeRate = input.documentToBaseRate;
    baseAmount = cleanProduct(cashAmount, input.documentToBaseRate);
  }

  let accountAmount: number | null = null;
  if (cashCurrency && accountCurrency && cashCurrency === accountCurrency) {
    accountAmount = cashAmount;
  } else if (isUsableDocumentRate(input.documentToAccountRate)) {
    accountAmount = cleanProduct(cashAmount, input.documentToAccountRate);
  }

  return {
    cashAmount,
    cashCurrency,
    exchangeRate,
    baseAmount,
    accountAmount,
  };
}

/**
 * Kayıtlı kasa satırından ana para karşılığı.
 * Para birimleri aynıysa tutarın kendisi.
 * Farklıysa kur, 1'den farklı belge→ana para kuru olmalıdır.
 * Kur yok veya yer tutucu 1 ise null — IQD tutarı USD yazılmaz.
 */
export function baseEquivalentFromStoredLine(input: {
  amount: number | string | null | undefined;
  currency?: string | null;
  baseCurrency: string;
  exchangeRate?: number | string | null;
}): number | null {
  const amount = parsePositiveAmount(input.amount);
  if (!(amount > 0)) return null;
  const currency = normalizeFxCurrency(input.currency);
  const base = normalizeFxCurrency(input.baseCurrency);
  if (!currency || !base) return null;
  if (currency === base) return amount;
  const rate = Number(input.exchangeRate);
  if (!Number.isFinite(rate) || !(rate > 0) || Math.abs(rate - 1) <= 1e-9) return null;
  return cleanProduct(amount, rate);
}

/** Kasa bakiyesi işareti: giriş +, çıkış −. Tutar kasa birimindedir, çevrilmez. */
export function cashRegisterMovement(amount: number, direction: 'in' | 'out'): number {
  const abs = parsePositiveAmount(amount);
  if (!(abs > 0)) return 0;
  return direction === 'out' ? -abs : abs;
}

export function sumOriginalByCurrency(
  lines: Array<{ amount: number | null | undefined; currency?: string | null }>,
): Array<{ currency: string; total: number }> {
  const map = new Map<string, number>();
  for (const line of lines) {
    const amount = parsePositiveAmount(line.amount);
    if (!(amount > 0)) continue;
    const currency = normalizeFxCurrency(line.currency) || '—';
    map.set(currency, (map.get(currency) || 0) + amount);
  }
  return [...map.entries()].map(([currency, total]) => ({
    currency,
    total: Math.round(total * 1e6) / 1e6,
  }));
}

/** Yalnız dolu ana para karşılıklarının toplamı. Hepsi boşsa null. */
export function sumBaseEquivalents(lines: Array<{ baseAmount: number | null | undefined }>): number | null {
  let sum = 0;
  let any = false;
  for (const line of lines) {
    if (line.baseAmount == null) continue;
    const n = Number(line.baseAmount);
    if (!Number.isFinite(n)) continue;
    any = true;
    sum += n;
  }
  if (!any) return null;
  return Math.round(sum * 1e6) / 1e6;
}

/**
 * Hesap borcu, hesap para biriminde.
 * null hesap tutarı (kur yok, çapraz) borçtan düşülmez.
 */
export function remainingObligation(
  openingInAccountCurrency: number,
  accountAmounts: Array<number | null | undefined>,
): number {
  let left = Number(openingInAccountCurrency) || 0;
  for (const raw of accountAmounts) {
    if (raw == null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    left -= Math.abs(n);
  }
  return Math.round(left * 1e6) / 1e6;
}

export type ReportFxSummary = {
  byCurrency: Array<{ currency: string; total: number }>;
  baseTotal: number | null;
  /** Birden fazla para birimi veya ana paradan farklı satır var. */
  splitsCurrencies: boolean;
};

/**
 * Gider güncellemesinde kayıtlı kur korunur. Yeni Hatwan kuru aranmaz.
 * Para birimi yoksa (eski satır) kasa tutarı f_amount olarak kalır.
 * Çapraz ve kur yok / yer tutucu 1 ise null.
 */
export function expenseFAmountOnUpdate(input: {
  newAmount: number | string | null | undefined;
  currency?: string | null;
  exchangeRate?: number | string | null;
  baseCurrency: string;
}): number | null {
  const amount = parsePositiveAmount(input.newAmount);
  if (!(amount > 0)) return null;
  const currency = normalizeFxCurrency(input.currency);
  if (!currency) return amount;
  return baseEquivalentFromStoredLine({
    amount,
    currency,
    baseCurrency: input.baseCurrency,
    exchangeRate: input.exchangeRate,
  });
}

/**
 * Ekstre satırı: kasa varsa orijinal kasa tutarı; yoksa hesap tutarı yerel birimde.
 * Ana para karşılığı yalnız kur varsa (veya birimler aynıysa).
 */
export function fxDisplayFields(input: {
  ledgerAmount?: number | null;
  cashAmount?: number | string | null;
  cashCurrency?: string | null;
  cashRate?: number | string | null;
  localCurrency: string;
  baseCurrency: string;
}): { original_amount: number | null; original_currency: string | null; base_amount: number | null } {
  const cashAmount = parsePositiveAmount(input.cashAmount);
  const cashCurrency = normalizeFxCurrency(input.cashCurrency);
  const base = normalizeFxCurrency(input.baseCurrency);
  if (cashAmount > 0 && cashCurrency) {
    return {
      original_amount: cashAmount,
      original_currency: cashCurrency,
      base_amount: baseEquivalentFromStoredLine({
        amount: cashAmount,
        currency: cashCurrency,
        baseCurrency: base,
        exchangeRate: input.cashRate,
      }),
    };
  }
  const ledger = Math.abs(Number(input.ledgerAmount) || 0);
  const local = normalizeFxCurrency(input.localCurrency);
  if (!(ledger > 0)) {
    return { original_amount: null, original_currency: local || null, base_amount: null };
  }
  return {
    original_amount: ledger,
    original_currency: local || null,
    base_amount: local && base && local === base ? ledger : null,
  };
}

/**
 * Rapor dip toplamı.
 * Para birimleri karışmıyorsa eski toplam (ham tutar) durur.
 * Karışıyorsa ana para: aynı birim ve kuru bilinen çapraz satırlar.
 * Kuru olmayan yabancı tutar ana paraya yazılmaz.
 * Para birimi boş satır (eski gider) ham tutarıyla kalır.
 */
export function reportAmountInBase(
  lines: Array<{
    amount: number | null | undefined;
    currency?: string | null;
    exchangeRate?: number | string | null;
  }>,
  baseCurrency: string,
): number {
  const summary = summarizeReportFx(lines, baseCurrency);
  if (!summary.splitsCurrencies) {
    const raw = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
    return Math.round(raw * 1e6) / 1e6;
  }
  const base = normalizeFxCurrency(baseCurrency);
  let sum = 0;
  for (const line of lines) {
    const currency = normalizeFxCurrency(line.currency);
    if (!currency || currency === base) {
      sum += parsePositiveAmount(line.amount);
      continue;
    }
    const eq = baseEquivalentFromStoredLine({
      amount: line.amount,
      currency,
      baseCurrency: base,
      exchangeRate: line.exchangeRate,
    });
    if (eq != null) sum += eq;
  }
  return Math.round(sum * 1e6) / 1e6;
}

export function summarizeReportFx(
  lines: Array<{
    amount: number | null | undefined;
    currency?: string | null;
    exchangeRate?: number | string | null;
  }>,
  baseCurrency: string,
): ReportFxSummary {
  const base = normalizeFxCurrency(baseCurrency);
  const enriched = lines.map((line) => {
    const currency = normalizeFxCurrency(line.currency);
    return {
      amount: parsePositiveAmount(line.amount),
      currency,
      baseAmount: currency
        ? baseEquivalentFromStoredLine({
            amount: line.amount,
            currency,
            baseCurrency: base,
            exchangeRate: line.exchangeRate,
          })
        : null,
    };
  });
  const byCurrency = sumOriginalByCurrency(enriched);
  const known = byCurrency.filter((row) => row.currency !== '—');
  const foreign = known.some((row) => base && row.currency !== base);
  const splitsCurrencies = known.length > 1 || foreign;
  return {
    byCurrency,
    baseTotal: sumBaseEquivalents(enriched),
    splitsCurrencies,
  };
}

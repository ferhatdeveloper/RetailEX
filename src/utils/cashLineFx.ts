/**
 * Kasa satırı çapraz döviz — kasa tutarı (amount) vs cari/defter tutarı (f_amount).
 *
 * Kurumsal kural:
 * - cash_lines.amount       = kasaya giren/çıkan tutar (kasa dövizi)
 * - cash_lines.currency_code = kasa dövizi
 * - cash_lines.exchange_rate = 1 birim kasa dövizi → kaç birim firma ana para (ledger)
 * - cash_lines.f_amount      = cari bakiyeye yazılan tutar (firma ana para)
 *
 * Aynı dövizde rate=1 ve amount ≈ f_amount.
 */

export function parsePositiveAmount(value: number | string | null | undefined): number {
  const n = Math.abs(parseFloat(String(value ?? 0)) || 0);
  return Number.isFinite(n) ? n : 0;
}

/** Çapraz döviz satırı mı? (rate ≠ 1 ve f_amount dolu) */
export function isCashLineCrossCurrency(
  exchangeRate?: number | string | null,
  fAmount?: number | string | null,
): boolean {
  const rate = parseFloat(String(exchangeRate ?? 1));
  const f = parsePositiveAmount(fAmount);
  return Number.isFinite(rate) && rate > 0 && Math.abs(rate - 1) > 1e-9 && f > 0;
}

/**
 * Cari / ekstre / ledger bakiyesi için tutar.
 * Çapraz dövizde f_amount; aksi halde amount (eski kayıtlarda f_amount=0 fallback).
 */
export function cashLineCariLedgerAmount(
  amount: number | string | null | undefined,
  fAmount?: number | string | null,
  exchangeRate?: number | string | null,
): number {
  const a = parsePositiveAmount(amount);
  const f = parsePositiveAmount(fAmount);
  if (isCashLineCrossCurrency(exchangeRate, fAmount)) return f;
  return a > 0 ? a : f;
}

/** kasa tutarı × belge→ledger kuru → cari tutarı */
export function convertCashAmountToLedger(
  cashAmount: number,
  documentToLedgerRate: number,
): number {
  const amt = parsePositiveAmount(cashAmount);
  const rate = Number(documentToLedgerRate);
  if (!(amt > 0) || !Number.isFinite(rate) || rate <= 0) return 0;
  return amt * rate;
}

/**
 * Kullanıcı dostu kur: 1 ledgerCurrency = ? cashCurrency
 * (örn. 1 USD = 1310 IQD). document→ledger rate'in tersi.
 */
export function invertDocumentToLedgerRate(documentToLedgerRate: number): number | null {
  const rate = Number(documentToLedgerRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (Math.abs(rate - 1) < 1e-12) return 1;
  return 1 / rate;
}

/** 1 ledger = X cash → document→ledger (1 cash = ? ledger) */
export function documentToLedgerFromInverse(oneLedgerInCash: number): number | null {
  const inv = Number(oneLedgerInCash);
  if (!Number.isFinite(inv) || inv <= 0) return null;
  if (Math.abs(inv - 1) < 1e-12) return 1;
  return 1 / inv;
}

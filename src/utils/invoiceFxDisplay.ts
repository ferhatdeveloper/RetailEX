import { getCurrencyDecimalPlaces } from './currency';
import { formatNumber } from './formatNumber';

function normalizeCurrencyCode(currency?: string | null): string {
  const code = String(currency ?? 'IQD').trim().toUpperCase();
  return code.length >= 3 ? code.slice(0, 10) : 'IQD';
}

/** Belge dövizi firma defter dövizinden farklı mı? */
export function invoiceIsForeignCurrency(
  docCurrency: string | null | undefined,
  ledgerCurrency: string | null | undefined,
): boolean {
  const doc = normalizeCurrencyCode(docCurrency);
  const led = normalizeCurrencyCode(ledgerCurrency);
  return Boolean(doc && led && doc !== led);
}

/** Defter tutarını belge dövizine çevir (currency_rate = belge→defter çarpanı). */
export function ledgerToDocumentAmount(ledgerAmount: number, currencyRate: number): number {
  const r = Number(currencyRate);
  if (!(r > 0) || !Number.isFinite(ledgerAmount)) return Number(ledgerAmount) || 0;
  return ledgerAmount / r;
}

/**
 * Liste / detay: dövizli faturada iki satır (FC + defter), yerel faturada tek satır.
 * `ledgerAmount` = DB total_amount / net_amount (defter).
 */
export function formatInvoiceDualAmountLines(options: {
  ledgerAmount: number;
  docCurrency?: string | null;
  currencyRate?: number | null;
  ledgerCurrency: string;
  bold?: boolean;
}): { primary: string; secondary?: string; isFx: boolean } {
  const ledgerCode = normalizeCurrencyCode(options.ledgerCurrency) || 'IQD';
  const docCode = normalizeCurrencyCode(options.docCurrency) || ledgerCode;
  const rate = Number(options.currencyRate);
  const ledgerAmt = Number(options.ledgerAmount) || 0;
  const isFx = invoiceIsForeignCurrency(docCode, ledgerCode) && rate > 0;

  const fmt = (n: number, code: string) => {
    const d = getCurrencyDecimalPlaces(code);
    return `${formatNumber(n, d, true)} ${code}`;
  };

  if (!isFx) {
    return { primary: fmt(ledgerAmt, ledgerCode), isFx: false };
  }

  const fcAmt = ledgerToDocumentAmount(ledgerAmt, rate);
  return {
    primary: fmt(fcAmt, docCode),
    secondary: fmt(ledgerAmt, ledgerCode),
    isFx: true,
  };
}

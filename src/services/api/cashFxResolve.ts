/**
 * Maaş / gider / ortak / cari yazımında kur.
 * Kaynak: müşteri tahsilatındaki `resolveCashFxHatwanQuote` + `postCashAgainstAccount`.
 */

import { ERP_SETTINGS, postgres } from '../postgres';
import { getGlobalCurrency } from '../../utils/currency';
import {
  normalizeFxCurrency,
  postCashAgainstAccount,
  type CashFxPosting,
} from '../../utils/cashFxPosting';
import { resolveCashFxHatwanQuote } from '../marketRatesService';

export type ResolvedCashFx = CashFxPosting & {
  baseCurrency: string;
  accountCurrency: string;
};

async function readFirmBaseCurrency(): Promise<string> {
  const firmNr = String(ERP_SETTINGS.firmNr || '').trim();
  if (!firmNr) return '';
  try {
    const { rows } = await postgres.query(
      `SELECT ana_para_birimi
         FROM firms
        WHERE firm_nr = $1 OR firm_nr = $2
        LIMIT 1`,
      [firmNr, firmNr.padStart(3, '0')],
    );
    return normalizeFxCurrency(rows?.[0]?.ana_para_birimi);
  } catch {
    return '';
  }
}

async function readLocalCurrency(): Promise<string> {
  try {
    const { rows } = await postgres.query(
      `SELECT default_currency FROM system_settings LIMIT 1`,
    );
    return normalizeFxCurrency(rows?.[0]?.default_currency);
  } catch {
    return '';
  }
}

export async function loadBookCurrencies(): Promise<{ baseCurrency: string; localCurrency: string }> {
  const base = (await readFirmBaseCurrency()) || normalizeFxCurrency(getGlobalCurrency()) || 'IQD';
  const local = (await readLocalCurrency()) || base;
  return { baseCurrency: base, localCurrency: local };
}

async function readRegisterCurrency(registerId: string): Promise<string> {
  const { rows } = await postgres.query(
    `SELECT currency_code FROM cash_registers WHERE id = $1::text::uuid LIMIT 1`,
    [registerId],
  );
  const code = normalizeFxCurrency(rows?.[0]?.currency_code);
  if (!code) throw new Error('Kasa para birimi okunamadı.');
  return code;
}

/**
 * Seçilen kasanın para biriminde tutar.
 * Ana para ve hesap tutarı tahsilat kurundan (`documentToLedger`) gelir.
 */
export async function resolveRegisterCashFx(input: {
  registerId: string;
  cashAmount: number;
  asOfDate?: string;
  /** Boşsa yerel para (system default), o da yoksa ana para. */
  accountCurrency?: string;
}): Promise<ResolvedCashFx> {
  const cashCurrency = await readRegisterCurrency(input.registerId);
  const books = await loadBookCurrencies();
  const baseCurrency = books.baseCurrency;
  const accountCurrency = normalizeFxCurrency(input.accountCurrency) || books.localCurrency || baseCurrency;
  const asOf = String(input.asOfDate || new Date().toISOString()).slice(0, 10);

  const [baseQuote, accountQuote] = await Promise.all([
    cashCurrency === baseCurrency
      ? Promise.resolve(null)
      : resolveCashFxHatwanQuote(cashCurrency, baseCurrency, asOf, 'Satış'),
    cashCurrency === accountCurrency
      ? Promise.resolve(null)
      : resolveCashFxHatwanQuote(cashCurrency, accountCurrency, asOf, 'Satış'),
  ]);

  const posted = postCashAgainstAccount({
    cashAmount: input.cashAmount,
    cashCurrency,
    baseCurrency,
    accountCurrency,
    documentToBaseRate: baseQuote && baseQuote.documentToLedger > 0 ? baseQuote.documentToLedger : null,
    documentToAccountRate:
      accountQuote && accountQuote.documentToLedger > 0 ? accountQuote.documentToLedger : null,
  });

  return { ...posted, baseCurrency, accountCurrency };
}

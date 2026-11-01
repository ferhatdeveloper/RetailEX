/**
 * Maaş / gider / ortak / cari yazımında kur.
 * Kaynak: müşteri tahsilatındaki `resolveCashFxHatwanQuote` + `postCashAgainstAccount`.
 */

import { ERP_SETTINGS, postgres } from '../postgres';
import { getGlobalCurrency } from '../../utils/currency';
import {
  cashRegisterMovement,
  normalizeFxCurrency,
  postCashAgainstAccount,
  postExpenseToRegister,
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

/**
 * Girilen gider tutarını kasa para birimine çevirir.
 * Kur: kasa fişindeki `resolveCashFxHatwanQuote` + `postExpenseToRegister`.
 * Aynı birimde tutar olduğu gibi kalır.
 */
export async function convertExpenseEnteredToRegister(input: {
  registerId: string;
  enteredAmount: number;
  enteredCurrency?: string | null;
  asOfDate?: string;
}): Promise<{ registerAmount: number; registerCurrency: string; converted: boolean }> {
  const registerId = String(input.registerId || '').trim();
  if (!registerId) throw new Error('Kasa seçilmedi.');
  const registerCurrency = await readRegisterCurrency(registerId);
  const enteredCurrency = normalizeFxCurrency(input.enteredCurrency) || registerCurrency;
  const enteredAmount = Math.abs(Number(input.enteredAmount) || 0);
  if (enteredCurrency === registerCurrency) {
    return { registerAmount: enteredAmount, registerCurrency, converted: false };
  }
  const asOf = String(input.asOfDate || new Date().toISOString()).slice(0, 10);
  const quote = await resolveCashFxHatwanQuote(enteredCurrency, registerCurrency, asOf, 'Satış');
  const rate = quote && quote.documentToLedger > 0 ? quote.documentToLedger : null;
  const books = await loadBookCurrencies();
  const posted = postExpenseToRegister({
    enteredAmount,
    enteredCurrency,
    registerCurrency,
    baseCurrency: books.baseCurrency,
    enteredToRegisterRate: rate,
    registerToBaseRate: null,
  });
  if (!posted?.converted || !(posted.registerAmount > 0)) {
    throw new Error('Kasa para birimine çevrilecek kur bulunamadı.');
  }
  return {
    registerAmount: posted.registerAmount,
    registerCurrency,
    converted: true,
  };
}

/**
 * Giderin kasaya yazılacak tutarı ve kasa fişindeki kur.
 * Tutar kasa birimindedir. Ana para karşılığı `resolveRegisterCashFx` ile bir kez yazılır.
 */
export async function resolveExpenseCashPosting(input: {
  registerId: string;
  enteredAmount: number;
  enteredCurrency?: string | null;
  asOfDate?: string;
}): Promise<ResolvedCashFx & {
  enteredAmount: number;
  enteredCurrency: string;
  converted: boolean;
  balanceDelta: number;
}> {
  const converted = await convertExpenseEnteredToRegister(input);
  const books = await loadBookCurrencies();
  const fx = await resolveRegisterCashFx({
    registerId: input.registerId,
    cashAmount: converted.registerAmount,
    asOfDate: input.asOfDate,
    accountCurrency: books.baseCurrency,
  });
  return {
    ...fx,
    enteredAmount: Math.abs(Number(input.enteredAmount) || 0),
    enteredCurrency: normalizeFxCurrency(input.enteredCurrency) || converted.registerCurrency,
    converted: converted.converted,
    balanceDelta: cashRegisterMovement(fx.cashAmount, 'out'),
  };
}

import { describe, expect, it } from 'vitest';
import { convertCashAmountToLedger } from '../../utils/cashLineFx';
import {
  baseEquivalentFromStoredLine,
  cashRegisterMovement,
  expenseFAmountOnUpdate,
  fxDisplayFields,
  postCashAgainstAccount,
  remainingObligation,
  reportAmountInBase,
  sumBaseEquivalents,
  sumOriginalByCurrency,
} from '../../utils/cashFxPosting';

const USD_PER_IQD = 1 / 1500;
const IQD_PER_USD = 1500;

describe('maaş kısmi ödeme — kasa birimi ve USD karşılığı', () => {
  const iqdPay = postCashAgainstAccount({
    cashAmount: 300_000,
    cashCurrency: 'IQD',
    baseCurrency: 'USD',
    accountCurrency: 'IQD',
    documentToBaseRate: USD_PER_IQD,
    documentToAccountRate: null,
  });
  const usdPay = postCashAgainstAccount({
    cashAmount: 100,
    cashCurrency: 'USD',
    baseCurrency: 'USD',
    accountCurrency: 'IQD',
    documentToBaseRate: null,
    documentToAccountRate: IQD_PER_USD,
  });

  it('IQD kasa −300.000 IQD, USD kasa −100 USD; tutarlar toplanıp tek kasaya yazılmaz', () => {
    expect(iqdPay.cashAmount).toBe(300_000);
    expect(iqdPay.cashCurrency).toBe('IQD');
    expect(cashRegisterMovement(iqdPay.cashAmount, 'out')).toBe(-300_000);
    expect(usdPay.cashAmount).toBe(100);
    expect(usdPay.cashCurrency).toBe('USD');
    expect(cashRegisterMovement(usdPay.cashAmount, 'out')).toBe(-100);
    const buckets = sumOriginalByCurrency([
      { amount: iqdPay.cashAmount, currency: iqdPay.cashCurrency },
      { amount: usdPay.cashAmount, currency: usdPay.cashCurrency },
    ]);
    expect(buckets).toEqual([
      { currency: 'IQD', total: 300_000 },
      { currency: 'USD', total: 100 },
    ]);
    expect(buckets.some((row) => row.total === 300_100)).toBe(false);
  });

  it('USD rapor karşılığı 300.000/1.500 + 100 = 300; fonksiyon tahsilattaki çarpımdır', () => {
    expect(iqdPay.baseAmount).toBeCloseTo(convertCashAmountToLedger(300_000, USD_PER_IQD), 5);
    expect(iqdPay.baseAmount).toBeCloseTo(200, 5);
    expect(usdPay.baseAmount).toBe(100);
    expect(sumBaseEquivalents([iqdPay, usdPay])).toBeCloseTo(300, 5);
  });

  it('kalan maaş borcu 50.000 IQD; ekstre orijinal birimleri ayrı tutar', () => {
    expect(iqdPay.accountAmount).toBe(300_000);
    expect(usdPay.accountAmount).toBe(150_000);
    expect(remainingObligation(500_000, [iqdPay.accountAmount, usdPay.accountAmount])).toBe(50_000);
    expect(sumOriginalByCurrency([
      { amount: iqdPay.cashAmount, currency: iqdPay.cashCurrency },
      { amount: usdPay.cashAmount, currency: usdPay.cashCurrency },
    ])).toEqual([
      { currency: 'IQD', total: 300_000 },
      { currency: 'USD', total: 100 },
    ]);
  });
});

describe('kur yokken IQD tutar USD yazılmaz', () => {
  it('çapraz kur boşsa exchange_rate ve ana para karşılığı null', () => {
    const row = postCashAgainstAccount({
      cashAmount: 300_000,
      cashCurrency: 'IQD',
      baseCurrency: 'USD',
      accountCurrency: 'IQD',
      documentToBaseRate: null,
      documentToAccountRate: null,
    });
    expect(row.exchangeRate).toBeNull();
    expect(row.baseAmount).toBeNull();
    expect(row.cashAmount).toBe(300_000);
    expect(row.accountAmount).toBe(300_000);
    expect(sumBaseEquivalents([row])).toBeNull();
    expect(baseEquivalentFromStoredLine({
      amount: 300_000,
      currency: 'IQD',
      baseCurrency: 'USD',
      exchangeRate: 1,
    })).toBeNull();
  });
});

describe('gider ve cari ödeme aynı kasa/kur ayrımını kullanır', () => {
  it('gider IQD kasadan çıkar, USD karşılığı kur ile yazılır', () => {
    const gider = postCashAgainstAccount({
      cashAmount: 300_000,
      cashCurrency: 'IQD',
      baseCurrency: 'USD',
      accountCurrency: 'USD',
      documentToBaseRate: USD_PER_IQD,
      documentToAccountRate: USD_PER_IQD,
    });
    expect(cashRegisterMovement(gider.cashAmount, 'out')).toBe(-300_000);
    expect(gider.cashCurrency).toBe('IQD');
    expect(gider.baseAmount).toBeCloseTo(200, 5);
    expect(gider.accountAmount).toBeCloseTo(200, 5);
  });

  it('cari ödeme kasadan çıkar, cari tahsilat kasaya girer; hesap ana parada', () => {
    const odeme = postCashAgainstAccount({
      cashAmount: 100,
      cashCurrency: 'USD',
      baseCurrency: 'USD',
      accountCurrency: 'USD',
      documentToBaseRate: null,
      documentToAccountRate: null,
    });
    const tahsilat = postCashAgainstAccount({
      cashAmount: 300_000,
      cashCurrency: 'IQD',
      baseCurrency: 'USD',
      accountCurrency: 'USD',
      documentToBaseRate: USD_PER_IQD,
      documentToAccountRate: USD_PER_IQD,
    });
    expect(cashRegisterMovement(odeme.cashAmount, 'out')).toBe(-100);
    expect(odeme.baseAmount).toBe(100);
    expect(cashRegisterMovement(tahsilat.cashAmount, 'in')).toBe(300_000);
    expect(tahsilat.accountAmount).toBeCloseTo(200, 5);
    expect(tahsilat.cashAmount).not.toBe(tahsilat.accountAmount);
  });

  it('ortak çıkışı kasa birimini bozmaz, hesaba kur ile geçer', () => {
    const ortak = postCashAgainstAccount({
      cashAmount: 100,
      cashCurrency: 'USD',
      baseCurrency: 'USD',
      accountCurrency: 'IQD',
      documentToBaseRate: null,
      documentToAccountRate: IQD_PER_USD,
    });
    expect(cashRegisterMovement(ortak.cashAmount, 'out')).toBe(-100);
    expect(ortak.baseAmount).toBe(100);
    expect(ortak.accountAmount).toBe(150_000);
  });
});

describe('ekstre ve rapor dip toplamı para birimini karıştırmaz', () => {
  it('gider güncellemesi kayıtlı kuru kullanır; kur yoksa IQD, USD olmaz', () => {
    expect(expenseFAmountOnUpdate({
      newAmount: 300_000,
      currency: 'IQD',
      exchangeRate: USD_PER_IQD,
      baseCurrency: 'USD',
    })).toBeCloseTo(200, 5);
    expect(expenseFAmountOnUpdate({
      newAmount: 300_000,
      currency: 'IQD',
      exchangeRate: 1,
      baseCurrency: 'USD',
    })).toBeNull();
    expect(expenseFAmountOnUpdate({
      newAmount: 45_000,
      currency: 'USD',
      exchangeRate: 1,
      baseCurrency: 'USD',
    })).toBe(45_000);
  });

  it('ekstre satırı orijinal birimi ve USD karşılığını ayırır', () => {
    const iqd = fxDisplayFields({
      ledgerAmount: 300_000,
      cashAmount: 300_000,
      cashCurrency: 'IQD',
      cashRate: USD_PER_IQD,
      localCurrency: 'IQD',
      baseCurrency: 'USD',
    });
    const usd = fxDisplayFields({
      ledgerAmount: 150_000,
      cashAmount: 100,
      cashCurrency: 'USD',
      cashRate: 1,
      localCurrency: 'IQD',
      baseCurrency: 'USD',
    });
    expect(iqd.original_currency).toBe('IQD');
    expect(usd.original_currency).toBe('USD');
    expect(sumOriginalByCurrency([
      { amount: iqd.original_amount, currency: iqd.original_currency },
      { amount: usd.original_amount, currency: usd.original_currency },
    ])).toEqual([
      { currency: 'IQD', total: 300_000 },
      { currency: 'USD', total: 100 },
    ]);
    expect(sumBaseEquivalents([
      { baseAmount: iqd.base_amount },
      { baseAmount: usd.base_amount },
    ])).toBeCloseTo(300, 5);
  });

  it('rapor toplamı kuru olmayan IQD tutarını USD diye yazmaz', () => {
    const mixed = reportAmountInBase([
      { amount: 300_000, currency: 'IQD', exchangeRate: USD_PER_IQD },
      { amount: 100, currency: 'USD', exchangeRate: 1 },
      { amount: 50_000, currency: 'IQD', exchangeRate: 1 },
    ], 'USD');
    expect(mixed).toBeCloseTo(300, 5);
    expect(reportAmountInBase([
      { amount: 45_000, currency: '', exchangeRate: null },
      { amount: 5_000, currency: '', exchangeRate: null },
    ], 'USD')).toBe(50_000);
  });
});

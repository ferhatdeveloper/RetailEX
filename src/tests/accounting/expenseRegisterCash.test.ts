import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertCashAmountToLedger } from '../../utils/cashLineFx';
import { postExpenseToRegister } from '../../utils/cashFxPosting';
import {
  expenseCashBalanceDeltaOnUpdate,
  expenseCashOutDeltas,
  readExpenseCashSelection,
} from '../../services/api/expenses';

const IQD_PER_USD = 1500;
const USD_PER_IQD = 1 / IQD_PER_USD;

describe('gider tutarı seçilen kasanın para biriminde', () => {
  it('USD kasada girilen USD tutara kur bir kez uygulanır; bakiye USD çıkar', () => {
    const row = postExpenseToRegister({
      enteredAmount: 100,
      enteredCurrency: 'USD',
      registerCurrency: 'USD',
      baseCurrency: 'IQD',
      enteredToRegisterRate: IQD_PER_USD,
      registerToBaseRate: IQD_PER_USD,
    });
    expect(row).not.toBeNull();
    expect(row?.converted).toBe(false);
    expect(row?.registerAmount).toBe(100);
    expect(row?.registerCurrency).toBe('USD');
    expect(row?.balanceDelta).toBe(-100);
    expect(row?.exchangeRate).toBe(IQD_PER_USD);
    expect(row?.baseAmount).toBeCloseTo(convertCashAmountToLedger(100, IQD_PER_USD), 5);
    expect(row?.baseAmount).toBe(150_000);
    expect(row?.registerAmount).not.toBe(150_000);
  });

  it('IQD girişi USD kasaya tek kurla çevrilir; çıkış işareti eksi kalır', () => {
    const once = convertCashAmountToLedger(150_000, USD_PER_IQD);
    const row = postExpenseToRegister({
      enteredAmount: 150_000,
      enteredCurrency: 'IQD',
      registerCurrency: 'USD',
      baseCurrency: 'USD',
      enteredToRegisterRate: USD_PER_IQD,
      registerToBaseRate: null,
    });
    expect(row?.converted).toBe(true);
    expect(row?.registerAmount).toBeCloseTo(once, 5);
    expect(row?.registerAmount).toBeCloseTo(100, 5);
    expect(row?.balanceDelta).toBeCloseTo(-100, 5);
    expect(row?.exchangeRate).toBe(1);
    const twice = convertCashAmountToLedger(once, USD_PER_IQD);
    expect(row?.registerAmount).not.toBeCloseTo(twice, 2);
    expect(row?.balanceDelta).toBeLessThan(0);
  });

  it('aynı birimde yabancı kur tutarı şişirmez; ana para kasada kur 1 dir', () => {
    const row = postExpenseToRegister({
      enteredAmount: 45_000,
      enteredCurrency: 'IQD',
      registerCurrency: 'IQD',
      baseCurrency: 'IQD',
      enteredToRegisterRate: IQD_PER_USD,
      registerToBaseRate: IQD_PER_USD,
    });
    expect(row?.registerAmount).toBe(45_000);
    expect(row?.balanceDelta).toBe(-45_000);
    expect(row?.exchangeRate).toBe(1);
    expect(row?.baseAmount).toBe(45_000);
  });

  it('çapraz kur yoksa veya yer tutucu 1 ise kasa tutarı uydurulmaz', () => {
    expect(postExpenseToRegister({
      enteredAmount: 100,
      enteredCurrency: 'EUR',
      registerCurrency: 'USD',
      baseCurrency: 'IQD',
      enteredToRegisterRate: null,
      registerToBaseRate: IQD_PER_USD,
    })).toBeNull();
    expect(postExpenseToRegister({
      enteredAmount: 100,
      enteredCurrency: 'EUR',
      registerCurrency: 'USD',
      baseCurrency: 'IQD',
      enteredToRegisterRate: 1,
      registerToBaseRate: IQD_PER_USD,
    })).toBeNull();
  });
});

describe('eski gider satırı kasasız yüklenir', () => {
  it('kasa kimliği boşsa tutar durur, hata fırlatılmaz', () => {
    expect(() => readExpenseCashSelection({ amount: '45.000', description: 'eski kira' } as never)).not.toThrow();
    const row = readExpenseCashSelection({ amount: '45.000' });
    expect(row.cashRegisterId).toBeNull();
    expect(row.currency).toBeNull();
    expect(row.amount).toBe(45_000);
    expect(readExpenseCashSelection(null)).toEqual({
      amount: 0,
      cashRegisterId: null,
      currency: null,
    });
  });

  it('seçili kasa ve para birimi okunur', () => {
    const row = readExpenseCashSelection({
      amount: 100,
      cash_register_id: '8d5c1c2a-6b7e-4f0a-9c1d-2e3f4a5b6c7d',
      currency_code: 'usd',
    });
    expect(row.cashRegisterId).toBe('8d5c1c2a-6b7e-4f0a-9c1d-2e3f4a5b6c7d');
    expect(row.currency).toBe('USD');
    expect(row.amount).toBe(100);
  });
});

describe('gider kasa çıkışı tek kasada ve eksi işaretle', () => {
  it('aynı kasada tutar düşünce çıkış azalır; eski bakiye formülüyle aynı delta', () => {
    const deltas = expenseCashOutDeltas('kasa-iqd', 'kasa-iqd', 450_000, 45_000);
    expect(deltas).toEqual([{ registerId: 'kasa-iqd', delta: 405_000 }]);
    expect(deltas[0].delta).toBe(expenseCashBalanceDeltaOnUpdate(450_000, 45_000));
    expect(deltas[0].delta).toBeGreaterThan(0);
  });

  it('kasa değişince eski çıkış geri gelir, yeni kasa yalnız kendi tutarı kadar azalır', () => {
    const deltas = expenseCashOutDeltas('kasa-iqd', 'kasa-usd', 45_000, 100);
    expect(deltas).toEqual([
      { registerId: 'kasa-iqd', delta: 45_000 },
      { registerId: 'kasa-usd', delta: -100 },
    ]);
    expect(deltas.some((step) => step.registerId === 'ana-kasa')).toBe(false);
    expect(deltas.filter((step) => step.delta < 0)).toHaveLength(1);
  });

  it('ilk kayıt yalnız seçilen kasadan çıkar', () => {
    const deltas = expenseCashOutDeltas(null, 'kasa-usd', 0, 100);
    expect(deltas).toEqual([{ registerId: 'kasa-usd', delta: -100 }]);
  });
});

describe('kapalı dönemde gider kasa yazısı dönem kontrolüne bağlı', () => {
  it('oluşturma, güncelleme ve silme dönem kapısını çağırır', () => {
    const src = readFileSync(resolve('src/services/api/expenses.ts'), 'utf8');
    expect(src).toContain('assertPeriodOpen');
    expect(src).toContain('resolveExpenseCashPosting');
    expect(src).toContain('fx.balanceDelta');
    expect(src).not.toContain('balance = balance - $1');
  });
});

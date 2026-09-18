/**
 * B01 / B23 — gider ↔ kasa ledger tutar parse ve bakiye delta.
 */
import { describe, it, expect } from 'vitest';
import {
  expenseCashBalanceDeltaOnUpdate,
  expenseCashBalanceDeltaOnDelete,
  parseExpenseAmount,
} from './expenses';
import {
  computeKasaIslemiSign,
  kasaIslemiBalanceDeltaOnUpdate,
} from './kasa';

describe('parseExpenseAmount (IQD / TR binlik)', () => {
  it('"45.000" → 45000', () => {
    expect(parseExpenseAmount('45.000')).toBe(45000);
  });

  it('"450.000" → 450000', () => {
    expect(parseExpenseAmount('450.000')).toBe(450000);
  });

  it('ham sayı ve US ondalık korunur', () => {
    expect(parseExpenseAmount(45000)).toBe(45000);
    expect(parseExpenseAmount('45,5')).toBe(45.5);
  });
});

describe('gider nakit bakiye delta (B01/B23)', () => {
  it('450k → 45k düzeltmede bakiyeye +405k eklenir (çıkış azalır)', () => {
    expect(expenseCashBalanceDeltaOnUpdate(450000, 45000)).toBe(405000);
  });

  it('silmede sign=-1 ile +45k geri konur (eski 450k EKLENMEZ)', () => {
    expect(expenseCashBalanceDeltaOnDelete(45000, -1)).toBe(45000);
    expect(expenseCashBalanceDeltaOnDelete(450000, -1)).toBe(450000);
  });

  it('senaryo: açılış 100k, 450k gider → 45k düzelt → sil → 100k', () => {
    let bal = 100000;
    bal += -450000; // create GIDER
    expect(bal).toBe(-350000);
    bal += expenseCashBalanceDeltaOnUpdate(450000, 45000); // in-place edit
    expect(bal).toBe(55000);
    bal += expenseCashBalanceDeltaOnDelete(45000, -1); // delete
    expect(bal).toBe(100000);
  });
});

describe('updateKasaIslemi in-place delta', () => {
  it('GIDER_PUSULASI sign=-1', () => {
    expect(computeKasaIslemiSign('GIDER_PUSULASI')).toBe(-1);
  });

  it('450k→45k GIDER yerinde güncelleme bakiyeye +405k', () => {
    const delta = kasaIslemiBalanceDeltaOnUpdate(450000, -1, 45000, -1);
    expect(delta).toBe(405000);
  });
});

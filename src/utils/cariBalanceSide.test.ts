/**
 * Borçlu / alacaklı cari bakiye yönü — ABS yok, müşteri↔tedarikçi simetrisi.
 */
import { describe, expect, it } from 'vitest';
import {
  getCariBalanceDirection,
  isCariCreditorBalance,
  isCariDebtorBalance,
  resolveCariBalanceSide,
} from './cariAccountStatement';

const tm = (k: string) => k;

describe('resolveCariBalanceSide / isCariDebtorBalance / isCariCreditorBalance', () => {
  it('sıfır bakiyeyi borçlu/alacaklı saymaz', () => {
    expect(resolveCariBalanceSide('customer', 0)).toBe('');
    expect(isCariDebtorBalance('customer', 0)).toBe(false);
    expect(isCariCreditorBalance('customer', 0)).toBe(false);
    expect(isCariDebtorBalance('supplier', 0.005)).toBe(false);
  });

  it('müşteri: + borçlu (alacağımız), − alacaklı (borcumuz)', () => {
    expect(isCariDebtorBalance('customer', 1500)).toBe(true);
    expect(isCariCreditorBalance('customer', 1500)).toBe(false);
    expect(isCariDebtorBalance('customer', -200)).toBe(false);
    expect(isCariCreditorBalance('customer', -200)).toBe(true);
  });

  it('tedarikçi simetrisi: + alacaklı (borcumuz), − borçlu (alacağımız) — ABS ile ezilmez', () => {
    expect(isCariDebtorBalance('supplier', 800)).toBe(false);
    expect(isCariCreditorBalance('supplier', 800)).toBe(true);
    expect(isCariDebtorBalance('supplier', -300)).toBe(true);
    expect(isCariCreditorBalance('supplier', -300)).toBe(false);
  });

  it('partner müşteri gibi; personel ters etiket (A/B) ama isCari* ile uyumlu', () => {
    expect(isCariDebtorBalance('partner', 100)).toBe(true);
    expect(isCariCreditorBalance('partner', -50)).toBe(true);
    expect(isCariDebtorBalance('employee', -40)).toBe(true);
    expect(isCariCreditorBalance('employee', 40)).toBe(true);
  });

  it('getCariBalanceDirection.side ile resolveCariBalanceSide aynıdır', () => {
    const cases: Array<{ ct: 'customer' | 'supplier' | 'employee' | 'partner'; bal: number }> = [
      { ct: 'customer', bal: 10 },
      { ct: 'customer', bal: -10 },
      { ct: 'supplier', bal: 10 },
      { ct: 'supplier', bal: -10 },
      { ct: 'employee', bal: 5 },
      { ct: 'employee', bal: -5 },
      { ct: 'partner', bal: 7 },
      { ct: 'partner', bal: -7 },
    ];
    for (const { ct, bal } of cases) {
      expect(resolveCariBalanceSide(ct, bal)).toBe(getCariBalanceDirection(ct, bal, tm).side);
    }
  });
});

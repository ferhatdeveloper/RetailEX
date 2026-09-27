/**
 * Borçlu / alacaklı cari bakiye yönü — ABS yok, müşteri↔tedarikçi simetrisi.
 * Rapor satırları: borçlu = müşteri, alacaklı = tedarikçi.
 */
import { describe, expect, it } from 'vitest';
import {
  getCariBalanceDirection,
  isCariCreditorBalance,
  isCariCreditorsReportRow,
  isCariDebtorBalance,
  isCariDebtorsReportRow,
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

describe('isCariDebtorsReportRow / isCariCreditorsReportRow (rapor iş kuralı)', () => {
  it('borçlu raporu: yalnızca borçlu müşteri (buyer)', () => {
    expect(isCariDebtorsReportRow('customer', 1500)).toBe(true);
    expect(isCariDebtorsReportRow('customer', -200)).toBe(false);
    expect(isCariDebtorsReportRow('customer', 0)).toBe(false);
  });

  it('borçlu raporu: tedarikçi / partner / personel hariç (bakiye yönü ne olursa olsun)', () => {
    // Tedarikçi − = ledger’da borçlu ama rapor müşteriye kilitli
    expect(isCariDebtorsReportRow('supplier', -300)).toBe(false);
    expect(isCariDebtorsReportRow('supplier', 800)).toBe(false);
    expect(isCariDebtorsReportRow('partner', 100)).toBe(false);
    expect(isCariDebtorsReportRow('employee', -40)).toBe(false);
  });

  it('alacaklı raporu: yalnızca alacaklı tedarikçi (seller)', () => {
    expect(isCariCreditorsReportRow('supplier', 800)).toBe(true);
    expect(isCariCreditorsReportRow('supplier', -300)).toBe(false);
    expect(isCariCreditorsReportRow('supplier', 0)).toBe(false);
  });

  it('alacaklı raporu: müşteri / partner / personel hariç', () => {
    // Müşteri − = ledger’da alacaklı ama rapor tedarikçiye kilitli
    expect(isCariCreditorsReportRow('customer', -200)).toBe(false);
    expect(isCariCreditorsReportRow('customer', 1500)).toBe(false);
    expect(isCariCreditorsReportRow('partner', -50)).toBe(false);
    expect(isCariCreditorsReportRow('employee', 40)).toBe(false);
  });
});

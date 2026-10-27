import { describe, expect, it } from 'vitest';
import {
  cashLineCariLedgerAmount,
  convertCashAmountToLedger,
  documentToLedgerFromInverse,
  invertDocumentToLedgerRate,
  isCashLineCrossCurrency,
} from '../../utils/cashLineFx';

describe('cashLineFx', () => {
  it('IQD→USD: 750000 IQD at 1 USD=1310 IQD → ~572.52 USD cari', () => {
    const docToLedger = documentToLedgerFromInverse(1310)!;
    expect(docToLedger).toBeCloseTo(1 / 1310, 12);
    const cari = convertCashAmountToLedger(750_000, docToLedger);
    expect(cari).toBeCloseTo(750_000 / 1310, 5);
    expect(cashLineCariLedgerAmount(750_000, cari, docToLedger)).toBeCloseTo(cari, 5);
  });

  it('aynı dövizde amount kullanılır (rate=1)', () => {
    expect(cashLineCariLedgerAmount(480, 480, 1)).toBe(480);
    expect(isCashLineCrossCurrency(1, 480)).toBe(false);
  });

  it('eski kayıt f_amount=0 → amount fallback', () => {
    expect(cashLineCariLedgerAmount(1000, 0, 1)).toBe(1000);
  });

  it('ters kur yuvarlak trip', () => {
    const inv = 1310;
    const doc = documentToLedgerFromInverse(inv)!;
    expect(invertDocumentToLedgerRate(doc)).toBeCloseTo(inv, 8);
  });
});

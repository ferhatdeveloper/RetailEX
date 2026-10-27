import { describe, expect, it } from 'vitest';
import { crossRateFromPivotQuotes } from '../../services/api/masterData';
import { documentToLedgerFromInverse } from '../../utils/cashLineFx';

describe('crossRateFromPivotQuotes (Hatwan IQD pivot)', () => {
  it('IQD kasa → USD ledger: 1 IQD = 1/1677.5 USD', () => {
    const docToLed = crossRateFromPivotQuotes('IQD', 'USD', null, 1677.5);
    expect(docToLed).toBeCloseTo(1 / 1677.5, 12);
    const cari = 750_000 * (docToLed as number);
    expect(cari).toBeCloseTo(750_000 / 1677.5, 5);
  });

  it('USD belge → IQD ledger: 1 USD = 1677.5 IQD', () => {
    expect(crossRateFromPivotQuotes('USD', 'IQD', 1677.5, null)).toBeCloseTo(1677.5, 8);
  });

  it('UI ters kur → aynı docToLedger', () => {
    const inv = 1677.5;
    expect(documentToLedgerFromInverse(inv)).toBeCloseTo(1 / inv, 12);
  });
});

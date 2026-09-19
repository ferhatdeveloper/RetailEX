import { describe, expect, it } from 'vitest';
import {
  invoiceCashLineInsertUpdatesStoredCari,
  invoiceChTahsilatStoredDelta,
  invoiceMixedCustomerStoredDelta,
  shouldApplyChTahsilatCustomerBalanceAfterCashInsert,
} from '../../utils/invoiceCashPosting';

describe('karma fatura — saklanan cari tek tahsilat', () => {
  it('düz INSERT cariyi güncellemez — applyChTahsilat bir kez', () => {
    expect(invoiceCashLineInsertUpdatesStoredCari('direct')).toBe(false);
    expect(shouldApplyChTahsilatCustomerBalanceAfterCashInsert('direct')).toBe(true);
    expect(invoiceChTahsilatStoredDelta(40)).toBe(-40);
    expect(invoiceMixedCustomerStoredDelta(100, 40, 'direct')).toBe(60);
  });

  it('createKasaIslemi yazdıysa applyChTahsilat tekrarlanmaz', () => {
    expect(invoiceCashLineInsertUpdatesStoredCari('createKasaIslemi')).toBe(true);
    expect(shouldApplyChTahsilatCustomerBalanceAfterCashInsert('createKasaIslemi')).toBe(false);
    expect(invoiceMixedCustomerStoredDelta(100, 40, 'createKasaIslemi')).toBe(60);
    const doubleApply = 100 + invoiceChTahsilatStoredDelta(40) * 2;
    expect(doubleApply).toBe(20);
    expect(invoiceMixedCustomerStoredDelta(100, 40, 'direct')).not.toBe(doubleApply);
    expect(invoiceMixedCustomerStoredDelta(100, 40, 'createKasaIslemi')).not.toBe(doubleApply);
  });
});

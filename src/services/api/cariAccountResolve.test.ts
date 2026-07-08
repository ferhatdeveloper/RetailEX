import { describe, expect, it } from 'vitest';
import { filterSupplierRowsHiddenByCustomerCode, normalizeCariCode } from './cariAccountResolve';

describe('normalizeCariCode', () => {
  it('trim ve büyük harf', () => {
    expect(normalizeCariCode(' ted-053 ')).toBe('TED-053');
  });
});

describe('filterSupplierRowsHiddenByCustomerCode', () => {
  it('aynı kodlu tedarikçi satırını gizler', () => {
    const customers = [{ code: 'TED-053' }, { code: 'MUS-001' }];
    const suppliers = [
      { code: 'TED-053', name: 'dup' },
      { code: 'SUP-001', name: 'gerçek tedarikçi' },
    ];
    const out = filterSupplierRowsHiddenByCustomerCode(suppliers, customers);
    expect(out.map((r) => r.code)).toEqual(['SUP-001']);
  });
});

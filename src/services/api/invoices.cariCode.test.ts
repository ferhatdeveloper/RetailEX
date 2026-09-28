/**
 * Fatura düzenleme: unvan dolu / cari kod boş regresyonu.
 * sales satırında kod yok; join veya açık alandan çözülmeli.
 */
import { describe, expect, it } from 'vitest';
import { resolveMappedInvoiceCariCodes } from './invoices';

describe('resolveMappedInvoiceCariCodes', () => {
  it('satış: join_customer_code → customer_code', () => {
    expect(
      resolveMappedInvoiceCariCodes(
        { join_customer_code: 'MUS-001', join_supplier_code: '' },
        false,
      ),
    ).toEqual({ customer_code: 'MUS-001' });
  });

  it('satış: açık customer_code join yokken kullanılır', () => {
    expect(
      resolveMappedInvoiceCariCodes({ customer_code: ' ferhat-01 ' }, false),
    ).toEqual({ customer_code: 'ferhat-01' });
  });

  it('alış: join_supplier_code hem supplier hem customer_code', () => {
    expect(
      resolveMappedInvoiceCariCodes(
        { join_supplier_code: 'TED-053', join_customer_code: '' },
        true,
      ),
    ).toEqual({ supplier_code: 'TED-053', customer_code: 'TED-053' });
  });

  it('alış iade: supplier_code açık alan', () => {
    expect(
      resolveMappedInvoiceCariCodes({ supplier_code: 'TED-9' }, true),
    ).toEqual({ supplier_code: 'TED-9', customer_code: 'TED-9' });
  });

  it('kod yoksa boş nesne (unvan ayrı map edilir)', () => {
    expect(resolveMappedInvoiceCariCodes({}, false)).toEqual({});
    expect(resolveMappedInvoiceCariCodes({}, true)).toEqual({});
  });
});

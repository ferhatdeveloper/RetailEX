import { describe, expect, it } from 'vitest';
import {
  resolveInvoiceLineDisplayCode,
  saleItemVisibleCode,
  splitInvoiceLineIdentity,
} from '../../utils/invoiceLineDisplayCode';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

describe('splitInvoiceLineIdentity', () => {
  it('item_code UUID ise kod boş kalır, productId UUID olur', () => {
    const r = splitInvoiceLineIdentity({ item_code: uuid, product_id: uuid });
    expect(r.productId).toBe(uuid);
    expect(r.code).toBe('');
  });

  it('ürün kodunu UUID yerine kullanır', () => {
    const r = splitInvoiceLineIdentity({ item_code: '000001', product_id: uuid });
    expect(r.code).toBe('000001');
    expect(r.productId).toBe(uuid);
  });
});

describe('resolveInvoiceLineDisplayCode', () => {
  it('katalogdan hizmet/ürün kodunu çözer, UUID göstermez', () => {
    expect(
      resolveInvoiceLineDisplayCode(
        { code: uuid, productId: uuid },
        [{ id: uuid, code: 'PROD-20260918-0955' }],
        []
      )
    ).toBe('PROD-20260918-0955');
    expect(
      resolveInvoiceLineDisplayCode({ code: uuid, productId: uuid }, [], [{ id: uuid, code: '000001' }])
    ).toBe('000001');
  });

  it('bulunamazsa UUID döndürmez', () => {
    expect(resolveInvoiceLineDisplayCode({ code: uuid, productId: uuid }, [], [])).toBe('');
  });
});

describe('saleItemVisibleCode', () => {
  it('kayıtta UUID yazmaz', () => {
    expect(saleItemVisibleCode({ code: uuid, productId: uuid })).toBe('');
    expect(saleItemVisibleCode({ code: '000001', productId: uuid })).toBe('000001');
  });
});

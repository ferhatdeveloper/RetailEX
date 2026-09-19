import { describe, expect, it } from 'vitest';
import {
  alignExpiryQuantitiesToStock,
  dedupeExpiryRowsBySkuSkt,
  expiryLotMatchKey,
  expiryProductStockKey,
  finalizeExpiryReportQuantities,
} from './expiryReportQuantity';

describe('expiryProductStockKey', () => {
  it('productId öncelikli', () => {
    expect(expiryProductStockKey({ productId: 'p1', itemCode: '41', itemName: 'SABUN' })).toBe('id:p1');
  });
});

describe('finalizeExpiryReportQuantities — Envanter ile hizalama', () => {
  it('alış satır miktarı yerine güncel stok gösterir (EL KREMİ 58, SABUN 0)', () => {
    const rows = [
      {
        invoiceId: 'inv-a',
        itemCode: '40',
        itemName: 'EL KREMİ',
        productId: 'prod-krem',
        expiryDate: '2026-10-01',
        quantity: 50,
      },
      {
        invoiceId: 'inv-b',
        itemCode: '41',
        itemName: 'SABUN',
        productId: 'prod-sabun',
        expiryDate: '2026-09-20',
        quantity: 10,
      },
    ];
    const stock = new Map<string, number>([
      ['id:prod-krem', 58],
      ['id:prod-sabun', 0],
    ]);
    const out = finalizeExpiryReportQuantities(rows, stock);
    expect(out.find((r) => r.itemName === 'EL KREMİ')?.quantity).toBe(58);
    expect(out.find((r) => r.itemName === 'SABUN')?.quantity).toBe(0);
    expect(out.reduce((s, r) => s + r.quantity, 0)).toBe(58);
  });

  it('fatura + ürün kartı çiftini tek satırda birleştirir, stok miktarını korur', () => {
    const rows = [
      {
        invoiceId: 'inv-1',
        itemCode: '40',
        itemName: 'EL KREMİ',
        productId: 'prod-krem',
        expiryDate: '2026-10-01',
        quantity: 50,
      },
      {
        invoiceId: '',
        itemCode: '40',
        itemName: 'EL KREMİ',
        productId: 'prod-krem',
        expiryDate: '2026-10-01',
        quantity: 58,
      },
    ];
    const deduped = dedupeExpiryRowsBySkuSkt(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].invoiceId).toBe('inv-1');
    expect(deduped[0].quantity).toBe(58);
  });

  it('lot eşleşmesinde lot.quantity kullanır', () => {
    const rows = [
      {
        invoiceId: 'inv-1',
        itemCode: '40',
        itemName: 'EL KREMİ',
        productId: 'prod-krem',
        expiryDate: '2026-10-01',
        batchNo: 'L1',
        quantity: 50,
      },
    ];
    const stock = new Map([['id:prod-krem', 58]]);
    const lots = new Map([[expiryLotMatchKey(rows[0]), 12]]);
    const out = alignExpiryQuantitiesToStock(rows, stock, lots);
    expect(out[0].quantity).toBe(12);
  });

  it('çok SKT satırında FEFO: erken SKT tüm stoğu alır', () => {
    const rows = [
      {
        invoiceId: 'a',
        itemCode: '1',
        itemName: 'X',
        productId: 'p',
        expiryDate: '2026-12-01',
        quantity: 20,
      },
      {
        invoiceId: 'b',
        itemCode: '1',
        itemName: 'X',
        productId: 'p',
        expiryDate: '2026-10-01',
        quantity: 30,
      },
    ];
    const stock = new Map([['id:p', 40]]);
    const out = alignExpiryQuantitiesToStock(rows, stock);
    const early = out.find((r) => r.expiryDate === '2026-10-01')!;
    const late = out.find((r) => r.expiryDate === '2026-12-01')!;
    expect(early.quantity).toBe(40);
    expect(late.quantity).toBe(0);
  });
});

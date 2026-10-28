/**
 * Gün sonu Z — indirim bir kez.
 * Net satış = brüt − indirim − iade − gider.
 * Net nakit = net satış + rezervasyon.
 * Fiş `total` alanı indirim öncesi brüttür. Brüte indirim eklenmez.
 * Satır zaten netse (brüt 100, satır net 90, indirim 10) net 90 kalır.
 */
import { describe, expect, it } from 'vitest';
import type { Sale } from '../../core/types';
import {
  composeDayEndZStatement,
  composeDayEndZStatementForRange,
  resolveDayEndZDocument,
  restOrderToDayEndSale,
} from '../../utils/posZReport';

describe('gün sonu Z indirim', () => {
  it('brüt 3716571, indirim 162571, iade 0, gider 0, rezervasyon 0 → net 3554000', () => {
    const row = composeDayEndZStatement({
      transactionCount: 111,
      grossSales: 3_716_571,
      discount: 162_571,
      salesReturn: 0,
      expense: 0,
    });
    expect(row.grossSales).toBe(3_716_571);
    expect(row.discount).toBe(162_571);
    expect(row.salesReturn).toBe(0);
    expect(row.expense).toBe(0);
    expect(row.reservationAmount).toBe(0);
    expect(row.netSales).toBe(3_554_000);
    expect(row.netCash).toBe(3_554_000);
    expect(row.netSales).toBe(3_716_571 - 162_571);
    expect(row.netCash).toBe(row.netSales + row.reservationAmount);
    expect(row.netSales).not.toBe(3_716_571);
    expect(row.netCash).not.toBe(3_716_571);
  });

  it('indirim 0 ise net satış ve net nakit brüte eşittir', () => {
    const row = composeDayEndZStatement({
      grossSales: 3_716_571,
      discount: 0,
      salesReturn: 0,
      expense: 0,
    });
    expect(row.netSales).toBe(3_716_571);
    expect(row.netCash).toBe(3_716_571);
    expect(row.discount).toBe(0);
  });

  it('fiş total_net brütse indirim brüte eklenmez ve netten bir kez düşülür', () => {
    const row = composeDayEndZStatementForRange({
      dateFrom: '2026-10-15',
      dateTo: '2026-10-28',
      sales: [{
        id: 'fiche-1',
        receiptNumber: 'R-1',
        date: '2026-10-20T12:00:00',
        items: [],
        subtotal: 3_716_571,
        discount: 162_571,
        total: 3_716_571,
        paymentMethod: 'cash',
        status: 'completed',
      } as Sale],
    });
    expect(row.grossSales).toBe(3_716_571);
    expect(row.discount).toBe(162_571);
    expect(row.netSales).toBe(3_554_000);
    expect(row.netCash).toBe(3_554_000);
    expect(row.grossSales).not.toBe(3_716_571 + 162_571);
    expect(row.netSales).not.toBe(3_716_571);
  });

  it('satır neti 90 ve indirim 10 ise net satış 90; ikinci kez düşülmez', () => {
    const basis = resolveDayEndZDocument({
      subtotal: 100,
      total: 90,
      discount: 10,
      items: [{ quantity: 1, price: 100, total: 90, discount: 10 }],
    });
    expect(basis.gross).toBe(100);
    expect(basis.discount).toBe(10);
    expect(basis.net).toBe(90);
    expect(basis.net).not.toBe(80);
    expect(basis.net).not.toBe(100);

    const row = composeDayEndZStatementForRange({
      dateFrom: '2026-10-15',
      dateTo: '2026-10-28',
      sales: [{
        id: 'line-net',
        receiptNumber: 'R-2',
        date: '2026-10-20T12:00:00',
        items: [{ productId: 'p', productName: 'Çorba', quantity: 1, price: 100, discount: 10, total: 90 }],
        subtotal: 100,
        discount: 10,
        total: 90,
        paymentMethod: 'cash',
        status: 'completed',
      } as Sale],
    });
    expect(row.grossSales).toBe(100);
    expect(row.discount).toBe(10);
    expect(row.netSales).toBe(90);
    expect(row.netCash).toBe(90);
    expect(row.netSales).not.toBe(80);
  });

  it('restoran fişinde satır indirimi ile başlık indirimi ayrı düşülür', () => {
    const row = composeDayEndZStatementForRange({
      dateFrom: '2026-10-15',
      dateTo: '2026-10-28',
      sales: [{
        id: 'rest-fiche',
        receiptNumber: 'REST-4-1',
        date: '2026-10-20T12:00:00',
        notes: 'RestoranPOS|rest_order_id:abc',
        items: [{ productId: 'p', productName: 'Çorba', quantity: 1, price: 100, discount: 10, total: 90 }],
        subtotal: 90,
        discount: 15,
        total: 90,
        paymentMethod: 'cash',
        status: 'completed',
      } as Sale],
    });
    expect(row.grossSales).toBe(100);
    expect(row.discount).toBe(25);
    expect(row.netSales).toBe(75);
    expect(row.netCash).toBe(75);
    expect(row.netSales).not.toBe(90);
    expect(row.netSales).not.toBe(85);
  });

  it('adisyon satır iskontosu ve ikram brüte girer, netten bir kez düşülür', () => {
    const sale = restOrderToDayEndSale({
      id: 'order-1',
      order_no: 'A-1',
      closed_at: '2026-10-20T18:00:00',
      total_amount: 180,
      discount_amount: 20,
      items: [
        { quantity: 2, unit_price: 50, subtotal: 80, discount_pct: 20 },
        { quantity: 1, unit_price: 100, subtotal: 100 },
        { quantity: 1, unit_price: 40, subtotal: 40, is_complimentary: true },
      ],
    });
    const row = composeDayEndZStatementForRange({
      dateFrom: '2026-10-15',
      dateTo: '2026-10-28',
      sales: [sale],
    });
    expect(row.grossSales).toBe(240);
    expect(row.discount).toBe(80);
    expect(row.netSales).toBe(160);
    expect(row.netCash).toBe(160);
    expect(row.netSales).not.toBe(180);
    expect(row.netSales).not.toBe(240);
    expect(row.netSales).toBe(row.grossSales - row.discount);
  });
});

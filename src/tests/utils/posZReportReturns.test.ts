import { describe, expect, it } from 'vitest';
import type { Sale } from '../../core/types';
import { buildPosZReport, buildPosZReportForRange, isReturnSale } from '../../utils/posZReport';
import { localCalendarDateKey } from '../../utils/localCalendarDate';

const today = new Date().toISOString();

describe('posZReport returns', () => {
  it('isReturnSale detects negative total and return status', () => {
    expect(isReturnSale({ total: -100, status: 'return' } as Sale)).toBe(true);
    expect(isReturnSale({ total: 100, status: 'completed' } as Sale)).toBe(false);
  });

  it('buildPosZReport subtracts sales returns from summary', () => {
    const sales: Sale[] = [
      {
        id: '1',
        receiptNumber: 'POS-1',
        date: today,
        items: [],
        subtotal: 1000,
        discount: 0,
        total: 1000,
        paymentMethod: 'cash',
        status: 'completed',
        cashier: 'Ali',
      } as Sale,
      {
        id: '2',
        receiptNumber: 'IADE-1',
        date: today,
        items: [],
        subtotal: -200,
        discount: 0,
        total: -200,
        paymentMethod: 'cash',
        status: 'return',
        cashier: 'Ali',
      } as Sale,
    ];

    const report = buildPosZReport(sales, localCalendarDateKey(today));
    expect(report.totalSales).toBe(1);
    expect(report.refundAmount).toBe(200);
    expect(report.totalAmount).toBe(1000);
    expect(report.cashAmount).toBe(800);
    expect(report.cashierStats[0]?.returnTotal).toBe(200);
    expect(report.cashierStats[0]?.netRevenue).toBe(800);
  });

  it('buildPosZReportForRange aggregates returns in date window', () => {
    const sales: Sale[] = [
      {
        id: '1',
        receiptNumber: 'POS-1',
        date: '2026-06-10T10:00:00',
        items: [],
        subtotal: 500,
        discount: 0,
        total: 500,
        paymentMethod: 'card',
        status: 'completed',
      } as Sale,
      {
        id: '2',
        receiptNumber: 'IADE-1',
        date: '2026-06-11T11:00:00',
        items: [],
        subtotal: -50,
        discount: 0,
        total: -50,
        paymentMethod: 'card',
        status: 'return',
      } as Sale,
    ];

    const report = buildPosZReportForRange(sales, '2026-06-10', '2026-06-11', '10–11.06.2026');
    expect(report.refundAmount).toBe(50);
    expect(report.totalAmount).toBe(500);
    expect(report.cardAmount).toBe(450);
  });
});

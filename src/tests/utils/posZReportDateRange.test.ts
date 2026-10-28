/**
 * Gün sonu Z tarih aralığı.
 * Aralık dışındaki fiş ve gider toplama girmez.
 * Aralık içinde net satış = brüt − indirim − iade − gider.
 * Net nakit = net satış + rezervasyon. Kapanmış peşinat rezervasyona girmez.
 */
import { describe, expect, it } from 'vitest';
import type { Sale } from '../../core/types';
import {
  composeDayEndZStatementForRange,
  resolveDayEndZDateRange,
} from '../../utils/posZReport';

const PERIOD_FROM = '2026-10-01';
const PERIOD_TO = '2026-10-26';

function sale(partial: {
  id: string;
  receiptNumber: string;
  date: string;
  total: number;
  discount?: number;
  status?: string;
  cashier?: string;
}): Sale {
  return {
    id: partial.id,
    receiptNumber: partial.receiptNumber,
    date: partial.date,
    items: [],
    subtotal: partial.total,
    discount: partial.discount ?? 0,
    total: partial.total,
    paymentMethod: 'cash',
    status: partial.status ?? 'completed',
    cashier: partial.cashier ?? 'admin',
  } as Sale;
}

describe('gün sonu Z tarih aralığı', () => {
  it('boş aralık 1 Ekim 2026 – 26 Ekim 2026 dönemini bırakır', () => {
    expect(resolveDayEndZDateRange('', '', PERIOD_FROM, PERIOD_TO)).toEqual({
      from: PERIOD_FROM,
      to: PERIOD_TO,
      custom: false,
    });
    expect(resolveDayEndZDateRange('   ', '', PERIOD_FROM, PERIOD_TO).from).toBe(PERIOD_FROM);
    expect(resolveDayEndZDateRange('', '   ', PERIOD_FROM, PERIOD_TO).to).toBe(PERIOD_TO);
  });

  it('aralık dışındaki fiş brüt, iade, gider ve kasiyere girmez', () => {
    const row = composeDayEndZStatementForRange({
      dateFrom: PERIOD_FROM,
      dateTo: PERIOD_TO,
      sales: [
        sale({
          id: 'in-1',
          receiptNumber: 'F-1',
          date: '2026-10-01T12:00:00',
          total: 100_000,
          cashier: 'admin',
        }),
        sale({
          id: 'in-2',
          receiptNumber: 'F-2',
          date: '2026-10-26T12:00:00',
          total: 30_000,
          cashier: 'admin',
        }),
        sale({
          id: 'in-ret',
          receiptNumber: 'I-1',
          date: '2026-10-12T12:00:00',
          total: -15_000,
          status: 'return',
          cashier: 'admin',
        }),
        sale({
          id: 'out-sale',
          receiptNumber: 'F-OUT',
          date: '2026-09-30T12:00:00',
          total: 99_000,
          discount: 9_000,
          cashier: 'dışarı',
        }),
        sale({
          id: 'out-ret',
          receiptNumber: 'I-OUT',
          date: '2026-10-27T12:00:00',
          total: -40_000,
          status: 'return',
          cashier: 'dışarı',
        }),
      ],
      expenses: [
        { date: '2026-10-15T12:00:00', amount: 55_000 },
        { date: '2026-09-30T12:00:00', amount: 7_000 },
        { date: '2026-10-27T12:00:00', amount: 10_000 },
      ],
      reservation: {
        appointments: [
          {
            id: 'open-in',
            status: 'pre_paid',
            depositAmount: 5_000,
            appointmentDate: '2026-10-10T12:00:00',
          },
          {
            id: 'open-out',
            status: 'pre_paid',
            depositAmount: 8_000,
            appointmentDate: '2026-09-01T12:00:00',
          },
          {
            id: 'closed-in',
            status: 'completed',
            depositAmount: 20_000,
            appointmentDate: '2026-10-20T12:00:00',
          },
        ],
      },
    });

    expect(row.transactionCount).toBe(2);
    expect(row.grossSales).toBe(130_000);
    expect(row.discount).toBe(0);
    expect(row.salesReturn).toBe(15_000);
    expect(row.expense).toBe(55_000);
    expect(row.netSales).toBe(60_000);
    expect(row.netSales).toBe(row.grossSales - row.discount - row.salesReturn - row.expense);
    expect(row.reservationAmount).toBe(5_000);
    expect(row.netCash).toBe(65_000);
    expect(row.netCash).toBe(row.netSales + row.reservationAmount);
    expect(row.cashierStats).toEqual([
      expect.objectContaining({
        name: 'admin',
        salesCount: 2,
        grossRevenue: 130_000,
        returnTotal: 15_000,
      }),
    ]);
    expect(row.cashierStats.some((cashier) => cashier.name === 'dışarı')).toBe(false);
  });

  it('aralık içindeki indirim bir kez düşülür; brüte eklenmez', () => {
    const row = composeDayEndZStatementForRange({
      dateFrom: '2026-10-05',
      dateTo: '2026-10-08',
      sales: [
        sale({
          id: 'gross',
          receiptNumber: 'F-3',
          date: '2026-10-05T12:00:00',
          total: 80,
          discount: 20,
        }),
        sale({
          id: 'ret',
          receiptNumber: 'I-3',
          date: '2026-10-08T12:00:00',
          total: -10,
          status: 'return',
        }),
        sale({
          id: 'outside',
          receiptNumber: 'F-4',
          date: '2026-10-09T12:00:00',
          total: 50,
          discount: 5,
        }),
      ],
      expenses: [
        { date: '2026-10-06', amount: 5 },
        { date: '2026-10-04', amount: 30 },
      ],
    });

    expect(row.grossSales).toBe(80);
    expect(row.discount).toBe(20);
    expect(row.salesReturn).toBe(10);
    expect(row.expense).toBe(5);
    expect(row.netSales).toBe(45);
    expect(row.netSales).toBe(80 - 20 - 10 - 5);
    expect(row.netSales).not.toBe(80);
    expect(row.grossSales).not.toBe(100);
    expect(row.reservationAmount).toBe(0);
    expect(row.netCash).toBe(45);
    expect(row.netCash).toBe(row.netSales);
    expect(row.transactionCount).toBe(1);
  });
});

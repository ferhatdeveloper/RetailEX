import { describe, expect, it } from 'vitest';
import type { Sale } from '../../core/types';
import { localCalendarDateKey } from '../../utils/localCalendarDate';
import {
  aggregatePeriodSalesAndReturns,
  periodSummaryNetRemaining,
  sumPeriodSaleBuckets,
} from '../../utils/periodSummaryNet';

function sale(partial: Partial<Sale> & { id: string; total: number }): Sale {
  return {
    receiptNumber: partial.id,
    date: '2026-10-05T12:00:00',
    status: 'completed',
    paymentMethod: 'cash',
    subtotal: partial.total,
    discount: 0,
    cashier: 'kasa',
    items: [],
    isDeposit: false,
    payments: [{ method: 'cash', amount: Math.abs(partial.total), currency: 'IQD' }],
    ...partial,
  } as Sale;
}

function dayKey(row: Sale): string {
  return localCalendarDateKey(row.date);
}

describe('Aylık Gün Özeti — ürün iadesi netten bir kez düşülür', () => {
  const service = sale({ id: 'hair-cut', total: 110_000, date: '2026-10-05T12:00:00' });
  const boya = sale({ id: 'boya', total: 20_000, date: '2026-10-05T12:00:00' });
  const boyaReturn = sale({
    id: 'boya-iade',
    total: -10_000,
    status: 'return',
    date: '2026-10-18T12:00:00',
  });

  it('brüt ciro 130.000, iade 10.000, masraf 0, peşinat 20.000 → iade 10.000, net 120.000', () => {
    const map = aggregatePeriodSalesAndReturns([service, boya], [boyaReturn], dayKey);
    const total = sumPeriodSaleBuckets(map);
    const saleDay = map.get('2026-10-05');
    const returnDay = map.get('2026-10-18');

    expect(total.saleCount).toBe(2);
    expect(total.revenue).toBe(130_000);
    expect(total.returnsAmount).toBe(10_000);
    expect(total.returnDeduction).toBe(10_000);
    expect(total.returnsCount).toBe(1);
    expect(saleDay?.saleCount).toBe(2);
    expect(saleDay?.revenue).toBe(130_000);
    expect(saleDay?.returnsAmount ?? 0).toBe(0);
    expect(returnDay?.returnsAmount).toBe(10_000);
    expect(returnDay?.revenue ?? 0).toBe(0);
    expect(returnDay?.saleCount ?? 0).toBe(0);

    const net = periodSummaryNetRemaining({
      revenue: total.revenue,
      returnDeduction: total.returnDeduction,
      expenses: 0,
      expenseEnabled: true,
      ciroDisiTahsilat: 0,
      reservationDeposit: 20_000,
    });
    expect(net).toBe(120_000);
    expect(net).not.toBe(100_000);
    expect(net).not.toBe(110_000);
    expect(net).not.toBe(140_000);
  });

  it('veritabanında artı yazılmış iade bir kez düşülür, ciro 140.000 olmaz', () => {
    const positiveReturn = sale({
      id: 'boya-iade-arti',
      total: 10_000,
      status: 'return',
      date: '2026-10-18T12:00:00',
    });
    const map = aggregatePeriodSalesAndReturns([service, boya], [positiveReturn], dayKey);
    const total = sumPeriodSaleBuckets(map);
    expect(total.revenue).toBe(130_000);
    expect(total.returnsAmount).toBe(10_000);
    expect(total.saleCount).toBe(2);
    expect(periodSummaryNetRemaining({
      revenue: total.revenue,
      returnDeduction: total.returnDeduction,
      expenses: 0,
      expenseEnabled: true,
      reservationDeposit: 20_000,
    })).toBe(120_000);
  });

  it('aynı iade fişi ikinci kez düşülmez', () => {
    const map = aggregatePeriodSalesAndReturns(
      [service, boya, boyaReturn],
      [boyaReturn],
      dayKey,
    );
    const total = sumPeriodSaleBuckets(map);
    expect(total.revenue).toBe(130_000);
    expect(total.returnsAmount).toBe(10_000);
    expect(total.returnDeduction).toBe(10_000);
    expect(total.saleCount).toBe(2);
  });

  it('peşinat iade değildir; ciroya eklenmez ve neti 100.000 yapmaz', () => {
    const deposit = sale({
      id: 'pesinat',
      total: 20_000,
      isDeposit: true,
      date: '2026-10-02T12:00:00',
      notes: 'deposit:1',
    });
    const map = aggregatePeriodSalesAndReturns([service, boya, deposit], [boyaReturn], dayKey);
    const total = sumPeriodSaleBuckets(map);
    expect(total.revenue).toBe(130_000);
    expect(total.returnsAmount).toBe(10_000);
    expect(total.depositAmount).toBe(20_000);
    expect(total.saleCount).toBe(2);
    const net = periodSummaryNetRemaining({
      revenue: total.revenue,
      returnDeduction: total.returnDeduction,
      expenses: 0,
      expenseEnabled: true,
      ciroDisiTahsilat: 0,
      reservationDeposit: total.depositAmount,
    });
    expect(net).toBe(120_000);
  });

  it('masraf da bir kez düşülür: 130.000 − 10.000 − 5.000 = 115.000', () => {
    expect(periodSummaryNetRemaining({
      revenue: 130_000,
      returnDeduction: 10_000,
      expenses: 5_000,
      expenseEnabled: true,
      reservationDeposit: 20_000,
    })).toBe(115_000);
  });

  it('satış listesindeki refunded fiş ciro dışıdır ve netten ikinci kez inmez', () => {
    const refunded = sale({
      id: 'eski-iade',
      total: -10_000,
      status: 'refunded',
      date: '2026-10-18T12:00:00',
    });
    const map = aggregatePeriodSalesAndReturns([refunded], [], dayKey);
    const total = sumPeriodSaleBuckets(map);
    expect(total.revenue).toBe(0);
    expect(total.returnsAmount).toBe(10_000);
    expect(total.returnDeduction).toBe(0);
    expect(total.saleCount).toBe(0);
    expect(periodSummaryNetRemaining({
      revenue: total.revenue,
      returnDeduction: total.returnDeduction,
      expenses: 0,
      expenseEnabled: true,
    })).toBe(0);
  });
});

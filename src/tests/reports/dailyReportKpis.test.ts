import { describe, expect, it } from 'vitest';
import {
  dailyNetCollected,
  dailyNetSaleRevenue,
  listCashReturnOutflows,
  sumCashReturnOutflow,
  type DailyKpiSale,
} from '../../utils/dailyReportKpis';

/**
 * Bugün: hizmet 110.000 nakit (peşinat 20.000 bunun içinde),
 * ürün 20.000 nakit, iade 10.000 nakit.
 * Eski tahsil 130.000 = 110.000 + 20.000 ve iade düşülmemişti.
 */

function sale(partial: DailyKpiSale): DailyKpiSale {
  return partial;
}

const service = sale({
  id: 'hizmet',
  receiptNumber: 'HZM-1',
  total: 110_000,
  paymentMethod: 'cash',
  status: 'completed',
  customerName: 'TEST',
});

const product = sale({
  id: 'urun',
  receiptNumber: 'URN-1',
  total: 20_000,
  paymentMethod: 'cash',
  status: 'completed',
  customerName: 'FERDİN BEY',
});

const cashReturn = sale({
  id: 'iade',
  receiptNumber: '0000003',
  total: -10_000,
  paymentMethod: 'Nakit',
  status: 'return',
  customerName: 'FERDİN BEY',
});

const deposit = sale({
  id: 'pesinat',
  receiptNumber: 'PES-1',
  total: 20_000,
  paymentMethod: 'cash',
  status: 'completed',
  isDeposit: true,
  notes: 'deposit:1',
});

describe('günlük rapor — nakit iade ve net ciro', () => {
  const sales = [service, product, cashReturn];

  it('ciro ve belge 120.000; peşinat eklenmez; iade bir kez düşülür', () => {
    const net = dailyNetSaleRevenue([...sales, deposit]);
    const signedSum = 110_000 + 20_000 + -10_000;
    const doubleDrop = signedSum - 10_000;
    expect(doubleDrop).toBe(110_000);
    expect(net).toBe(120_000);
    expect(net).not.toBe(110_000);
    expect(net).not.toBe(130_000);
  });

  it('tahsil edilen 120.000, kasa çıkışı 10.000, brüt giriş 130.000 yalnız giren paradır', () => {
    const outflows = listCashReturnOutflows(sales);
    const cashOut = sumCashReturnOutflow(outflows);
    const collected = dailyNetCollected({ sales, reservationCash: 0, reservationCard: 0 });
    const grossCashIn = 110_000 + 20_000;

    expect(cashOut).toBe(10_000);
    expect(outflows).toHaveLength(1);
    expect(outflows[0].receiptNumber).toBe('0000003');
    expect(grossCashIn).toBe(130_000);
    expect(collected).toBe(120_000);
    expect(collected).not.toBe(130_000);
    expect(grossCashIn - cashOut).toBe(collected);
    expect(collected - 0).toBe(120_000);
  });

  it('peşinat ayrıca geçilmezse tahsilat 120.000 kalır', () => {
    expect(dailyNetCollected({ sales, reservationCash: 0 })).toBe(120_000);
    expect(dailyNetCollected({ sales })).toBe(120_000);
  });

  it('veresiye iade kasadan çıkmaz; tahsilat brüt girişte kalır', () => {
    const creditReturn = sale({
      ...cashReturn,
      id: 'iade-veresiye',
      paymentMethod: 'veresiye',
    });
    const rows = [service, product, creditReturn];
    expect(sumCashReturnOutflow(listCashReturnOutflows(rows))).toBe(0);
    expect(dailyNetCollected({ sales: rows })).toBe(130_000);
    expect(dailyNetSaleRevenue(rows)).toBe(120_000);
  });

  it('aynı fiş gider çıkışına yazıldıysa kasa çıkışına ikinci kez eklenmez', () => {
    const booked = new Set(['0000003']);
    expect(listCashReturnOutflows(sales, undefined, booked)).toHaveLength(0);
    expect(dailyNetCollected({
      sales,
      expenseReceiptKeys: booked,
    })).toBe(130_000);
  });
});

import { describe, expect, it } from 'vitest';
import { settleProductPeriodSalesNet } from '../../utils/productPeriodSalesNet';

describe('Ürün Bazlı Satış — net ciro', () => {
  it('brüt 20.000 ve iade 10.000 → net 10.000, ortalama birim 10.000', () => {
    const row = settleProductPeriodSalesNet({
      grossAmount: 20_000,
      returnAmount: 10_000,
      grossQuantity: 2,
      returnQuantity: 1,
    });

    expect(row.grossAmount).toBe(20_000);
    expect(row.grossQuantity).toBe(2);
    expect(row.returnAmount).toBe(10_000);
    expect(row.returnQuantity).toBe(1);
    expect(row.netAmount).toBe(10_000);
    expect(row.netQuantity).toBe(1);
    expect(row.avgUnitPrice).toBe(10_000);
  });

  it('iade gelire eklenmez (20.000 + 10.000 = 30.000 olmaz)', () => {
    const row = settleProductPeriodSalesNet({
      grossAmount: 20_000,
      returnAmount: 10_000,
      grossQuantity: 2,
      returnQuantity: 1,
    });
    expect(row.netAmount).not.toBe(30_000);
    expect(row.avgUnitPrice).not.toBe(15_000);
    expect(row.netAmount).toBe(row.grossAmount - row.returnAmount);
  });

  it('veritabanında eksi yazılmış iade bir kez düşülür, 0 olmaz', () => {
    const row = settleProductPeriodSalesNet({
      grossAmount: 20_000,
      returnAmount: -10_000,
      grossQuantity: 2,
      returnQuantity: -1,
    });
    expect(row.returnAmount).toBe(10_000);
    expect(row.returnQuantity).toBe(1);
    expect(row.netAmount).toBe(10_000);
    expect(row.netQuantity).toBe(1);
    expect(row.avgUnitPrice).toBe(10_000);
  });

  it('aynı satır ikinci kez işlense de net 10.000 kalır', () => {
    const once = settleProductPeriodSalesNet({
      grossAmount: 20_000,
      returnAmount: 10_000,
      grossQuantity: 2,
      returnQuantity: 1,
    });
    const twice = settleProductPeriodSalesNet(once);
    expect(twice.netAmount).toBe(10_000);
    expect(twice.avgUnitPrice).toBe(10_000);
    expect(twice.returnAmount).toBe(10_000);
    expect(twice.grossAmount).toBe(20_000);
  });

  it('iade yoksa net brüte eşittir', () => {
    const row = settleProductPeriodSalesNet({
      grossAmount: 20_000,
      returnAmount: 0,
      grossQuantity: 2,
      returnQuantity: 0,
    });
    expect(row.netAmount).toBe(20_000);
    expect(row.avgUnitPrice).toBe(10_000);
  });
});

import { describe, expect, it } from 'vitest';
import { inventoryListUnitPurchaseCost } from '../../utils/inventoryListValue';
import { productSaleCogs } from '../../utils/productSaleCogs';

describe('ürün SMM = satılan miktar × envanter birim alış', () => {
  it('BOYA: alış 5.500, adet 1, gelir 10.000 → SMM 5.500, brüt kâr 4.500, marj %45', () => {
    const unit = inventoryListUnitPurchaseCost({
      weightedAvg: 5500,
      layeredAvg: 105000 / 19,
      cardUnit: 5500,
    });
    const row = productSaleCogs({ quantity: 1, revenue: 10000, unitPurchase: unit });
    expect(unit).toBe(5500);
    expect(row.cogs).toBe(5500);
    expect(row.profit).toBe(4500);
    expect(row.marginPercent).toBe(45);
    expect(row.cogs).not.toBe(5000);
    expect(row.cogs).not.toBe(10000 * 0.5);
  });

  it('satış gelirinin yarısını maliyet saymaz', () => {
    const row = productSaleCogs({ quantity: 1, revenue: 10000, unitPurchase: 5500 });
    expect(row.cogs).toBe(5500);
    expect(10000 * 0.5).toBe(5000);
    expect(row.profit).toBe(4500);
  });

  it('alış yoksa SMM 0; gelir kâr diye şişmez, yüzde uydurulmaz', () => {
    const row = productSaleCogs({ quantity: 1, revenue: 10000, unitPurchase: 0 });
    expect(row.cogs).toBe(0);
    expect(row.profit).toBe(10000);
  });
});

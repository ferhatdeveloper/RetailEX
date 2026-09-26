import { describe, expect, it } from 'vitest';
import {
  computeLineGrossProfit,
  inferQtyFromRevenue,
  isUntrustedStoredGrossProfit,
  resolveLineGrossProfit,
  signedCogsAmount,
} from './lineGrossProfit';

describe('lineGrossProfit — SABUN senaryosu', () => {
  it('10k alış maliyetli 13k satış → kâr 3k (ciroyu kâr yazma)', () => {
    expect(
      computeLineGrossProfit({
        kind: 'sales',
        revenue: 13000,
        quantity: 1,
        unitCost: 10000,
        unitPrice: 13000,
      }),
    ).toBe(3000);
  });

  it('15k satış → kâr 5k', () => {
    expect(
      computeLineGrossProfit({
        kind: 'sales',
        revenue: 15000,
        quantity: 1,
        unitCost: 10000,
      }),
    ).toBe(5000);
  });

  it('satış iadesi: ciro ve COGS geri alınır → kâr −3k', () => {
    expect(
      computeLineGrossProfit({
        kind: 'sales_return',
        revenue: 13000,
        quantity: 1,
        unitCost: 10000,
        unitPrice: 13000,
      }),
    ).toBe(-3000);
  });

  it('alış satırında kâr yok (null)', () => {
    expect(
      computeLineGrossProfit({
        kind: 'purchase',
        revenue: 100000,
        quantity: 10,
        unitCost: 10000,
      }),
    ).toBeNull();
  });

  it('maliyet 0 iken ciroyu kâr yazma (null)', () => {
    expect(
      computeLineGrossProfit({
        kind: 'sales',
        revenue: 13000,
        quantity: 1,
        unitCost: 0,
      }),
    ).toBeNull();
  });

  it('kayıtlı gross_profit = ciro → güvenilmez; yeniden hesapla', () => {
    expect(isUntrustedStoredGrossProfit(13000, 13000, 0)).toBe(true);
    expect(isUntrustedStoredGrossProfit(13000, 13000, 10000)).toBe(true);
    expect(isUntrustedStoredGrossProfit(3000, 13000, 10000)).toBe(false);
    // Maliyet yok ama stored ≠ ciro → kaydı koru
    expect(isUntrustedStoredGrossProfit(3000, 13000, 0)).toBe(false);

    expect(
      resolveLineGrossProfit({
        kind: 'sales',
        storedGrossProfit: 13000,
        revenue: 13000,
        quantity: 1,
        unitCost: 10000,
        unitPrice: 13000,
      }),
    ).toBe(3000);
  });

  it('stored = ciro ve maliyet 0 → null (ciroyu kâr yazma)', () => {
    expect(
      resolveLineGrossProfit({
        kind: 'sales',
        storedGrossProfit: 13000,
        revenue: 13000,
        quantity: 1,
        unitCost: 0,
        unitPrice: 13000,
      }),
    ).toBeNull();
  });

  it('stored = ciro ama avg maliyet var → 3k hesapla', () => {
    expect(
      resolveLineGrossProfit({
        kind: 'sales',
        storedGrossProfit: 13000,
        revenue: 13000,
        quantity: 1,
        unitCost: 10000,
        unitPrice: 13000,
      }),
    ).toBe(3000);
  });

  it('iadede qty=0 ama ciro/fiyat var → miktar tahmin + COGS geri al', () => {
    expect(inferQtyFromRevenue(0, 13000, 13000)).toBe(1);
    expect(
      computeLineGrossProfit({
        kind: 'sales_return',
        revenue: 13000,
        quantity: 0,
        unitCost: 10000,
        unitPrice: 13000,
      }),
    ).toBe(-3000);
  });

  it('fiyat farkı iadesi (qty=0, birim fiyat yok): yalnızca ciro etkisi', () => {
    expect(
      signedCogsAmount({ quantity: 0, unitCost: 10000, isSalesReturn: true }),
    ).toBe(0);
    expect(
      computeLineGrossProfit({
        kind: 'sales_return',
        revenue: 3000,
        quantity: 0,
        unitCost: 10000,
        unitPrice: 0,
      }),
    ).toBe(-3000);
  });

  it('net senaryo: satış 13k + iade 13k + satış 15k → net kâr 5k', () => {
    const sale1 = computeLineGrossProfit({
      kind: 'sales',
      revenue: 13000,
      quantity: 1,
      unitCost: 10000,
    })!;
    const ret = computeLineGrossProfit({
      kind: 'sales_return',
      revenue: 13000,
      quantity: 1,
      unitCost: 10000,
    })!;
    const sale2 = computeLineGrossProfit({
      kind: 'sales',
      revenue: 15000,
      quantity: 1,
      unitCost: 10000,
    })!;
    expect(sale1 + ret + sale2).toBe(5000);
  });
});

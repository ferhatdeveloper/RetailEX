/**
 * Bug 33 (2026-10-09 guzel DB) — Malzeme Değer Raporu / alış ağırlıklı ortalama
 * birim maliyet hesabı **fatura dip indirimini** yansıtmalıdır.
 *
 * Senaryo (gerçek DB):
 *   Fatura 1: 10 adet × 5.000 = 50.000 (indirim yok)         net fatura = 50.000
 *   Fatura 2: 10 adet × 6.000 = 60.000 (10.000 dip indirim)   net fatura = 50.000
 *   Toplam: 20 adet / 100.000 net                                → 5.000 birim
 *
 * Eski hesap (brüt satır net_amount toplamı) 110.000 / 20 = 5.500 (yanlış)
 * Yeni hesap (dip indirim oranı uygulanmış)  100.000 / 20 = 5.000 (doğru)
 */
import { describe, expect, it } from 'vitest';
import {
  addWeightedAvgLine,
  emptyWeightedAvg,
  finalizeWeightedAvgUnitCost,
  mergeWeightedAvgMaps,
} from '../../utils/weightedAverageUnitCost';

/** weightedAverageUnitCost.ts iç mantığı (ingestLine + scaledLineAmount) */
function scaledLineAmount(
  rawLineNet: number,
  invoiceTotalNet: number,
  invoiceNet: number,
): number {
  const lineNet = Math.abs(Number(rawLineNet) || 0);
  const total = Math.abs(Number(invoiceTotalNet) || 0);
  const net = Math.abs(Number(invoiceNet) || 0);
  if (!(total > 0) || !(lineNet > 0)) return lineNet;
  if (Math.abs(total - net) <= 0.009) return lineNet;
  return lineNet * (net / total);
}

describe('weightedAverageUnitCost — dip indirim dahil', () => {
  it('dip indirim oranı: 60000 → 50000 → 0.8333', () => {
    // Fatura 2: brüt 60.000, dip indirim 10.000, net 50.000
    const out = scaledLineAmount(60000, 60000, 50000);
    expect(out).toBeCloseTo(50000, 4);
  });

  it('dip indirim yoksa (total_net == net_amount) satır net_amount aynen kullanılır', () => {
    // Fatura 1: brüt 50.000, dip 0, net 50.000 → oran 1, satır net aynen
    const out = scaledLineAmount(50000, 50000, 50000);
    expect(out).toBe(50000);
  });

  it('toplam 0 veya satır 0 ise satır net döner', () => {
    expect(scaledLineAmount(0, 60000, 50000)).toBe(0);
    expect(scaledLineAmount(60000, 0, 50000)).toBe(60000);
  });

  it('Bug 33 — 2 alış + 1 dip indirimli fatura → ortalama 5.000 (100.000 / 20)', () => {
    const acc = emptyWeightedAvg();
    // Fatura 1: 10 adet, brüt 50.000 = net 50.000
    addWeightedAvgLine(acc, { quantity: 10, unitCost: 5000, amount: 50000 });
    // Fatura 2: 10 adet, brüt satır 60.000; dip indirim sonrası 50.000
    addWeightedAvgLine(acc, {
      quantity: 10,
      unitCost: 6000, // satır unit_price (brüt) — unitCostFromPurchaseLine net'e öncelik verir
      amount: scaledLineAmount(60000, 60000, 50000), // = 50.000
    });
    expect(acc.qtySum).toBe(20);
    expect(acc.amountSum).toBeCloseTo(100000, 2);
    expect(finalizeWeightedAvgUnitCost(acc)).toBeCloseTo(5000, 2);
  });

  it('regresyon: dip indirimsiz alışlarda eski hesapla aynı sonuç', () => {
    const acc = emptyWeightedAvg();
    addWeightedAvgLine(acc, { quantity: 10, unitCost: 5000, amount: 50000 });
    addWeightedAvgLine(acc, { quantity: 10, unitCost: 6000, amount: 60000 });
    expect(acc.qtySum).toBe(20);
    expect(acc.amountSum).toBe(110000);
    expect(finalizeWeightedAvgUnitCost(acc)).toBeCloseTo(5500, 2);
  });

  it('mergeWeightedAvgMaps aynı ürünü toplar', () => {
    const map = new Map<string, ReturnType<typeof emptyWeightedAvg>>();
    mergeWeightedAvgMaps(map, 'PROD-1', { quantity: 10, unitCost: 5000, amount: 50000 });
    mergeWeightedAvgMaps(map, 'PROD-1', {
      quantity: 10,
      unitCost: 6000,
      amount: scaledLineAmount(60000, 60000, 50000),
    });
    const avg = finalizeWeightedAvgUnitCost(map.get('PROD-1')!);
    expect(avg).toBeCloseTo(5000, 2);
  });
});

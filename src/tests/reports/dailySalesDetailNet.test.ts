/**
 * Satış Detayları — Net tutar kolonu.
 *
 * 0000003 iade: indirim öncesi −10.000, indirim 0 iken net +10.000 (veya
 * dip toplamda 0) görünüyordu. Net −10.000 olmalı.
 * Üç satır: 110.000 + 20.000 − 10.000 = 120.000.
 * 130.000 (iade düşülmez / artı sayılır) ve 110.000 (ürün satışı da silinir) yanlış.
 */

import { describe, expect, it } from 'vitest';
import {
  dailySalesDetailNetAmount,
  sumDailySalesDetailNet,
} from '../../utils/dailySalesDetailNet';

const service = { beforeDiscount: 110_000, total: 110_000, discount: 0 };
const product = { beforeDiscount: 20_000, total: 20_000, discount: 0 };

describe('dailySalesDetailNet — iade net işareti', () => {
  it('indirim 0 iken iade net tutarı indirim öncesi ile aynı, −10.000', () => {
    const ret = { beforeDiscount: -10_000, total: -10_000, discount: 0 };
    expect(dailySalesDetailNetAmount(service)).toBe(110_000);
    expect(dailySalesDetailNetAmount(product)).toBe(20_000);
    expect(dailySalesDetailNetAmount(ret)).toBe(-10_000);
    expect(sumDailySalesDetailNet([service, product, ret])).toBe(120_000);
  });

  it('fiş tutarı mutlak +10.000 kalsa da indirim öncesi eksi ise net −10.000', () => {
    // Eski hücre: Math.max(0, total − indirim) = Math.max(0, 10.000) = +10.000
    const ret = { beforeDiscount: -10_000, total: 10_000, discount: 0 };
    const oldCell = Math.max(0, (Number(ret.total) || 0) - (Number(ret.discount) || 0));
    expect(oldCell).toBe(10_000);
    expect(dailySalesDetailNetAmount(ret)).toBe(-10_000);
    expect(sumDailySalesDetailNet([service, product, ret])).toBe(120_000);
  });

  it('işaretli fiş tutarında eski Math.max iadeyi 0 yapar, dip toplam 130.000 kalır', () => {
    const ret = { beforeDiscount: -10_000, total: -10_000, discount: 0 };
    const oldSum = [service, product, ret].reduce(
      (acc, row) => acc + Math.max(0, (Number(row.total) || 0) - (Number(row.discount) || 0)),
      0,
    );
    expect(oldSum).toBe(130_000);
    expect(sumDailySalesDetailNet([service, product, ret])).toBe(120_000);
    expect(sumDailySalesDetailNet([service, product, ret])).not.toBe(110_000);
  });

  it('pozitif satışta indirim brütten düşer, hizmet ve ürün netleri değişmez', () => {
    expect(dailySalesDetailNetAmount({
      beforeDiscount: 100_000,
      total: 100_000,
      discount: 50_000,
    })).toBe(50_000);
    // İndirim öncesi subtotal boşken total+indirim şişer; brüt yine total.
    expect(dailySalesDetailNetAmount({
      beforeDiscount: 150_000,
      total: 100_000,
      discount: 50_000,
    })).toBe(50_000);
    expect(dailySalesDetailNetAmount(service)).toBe(110_000);
    expect(dailySalesDetailNetAmount(product)).toBe(20_000);
  });

  it('iade indirimi tutarın büyüklüğünü düşürür, işareti artıya çevirmez', () => {
    expect(dailySalesDetailNetAmount({
      beforeDiscount: -10_000,
      total: -8_000,
      discount: 2_000,
    })).toBe(-8_000);
  });

  it('depozito satırı dip toplama girmez', () => {
    const rows = [
      service,
      { beforeDiscount: 5_000, total: 5_000, discount: 0, isDeposit: true },
    ];
    expect(sumDailySalesDetailNet(rows)).toBe(110_000);
  });
});

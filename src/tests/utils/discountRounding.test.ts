import { describe, it, expect } from 'vitest';
import {
  roundPosMoneyAmount,
  roundPosDiscountAmountUp,
  lineNetAfterPercentDiscount,
  lineDiscountMoneyFromPercent,
  posPaymentAdditionalDiscount,
  getPosQuickDiscountAmountPresets,
  POS_DISCOUNT_MONETARY_STEP,
} from '../../utils/discountRounding';

describe('discountRounding — IQD POS kademesi', () => {
  it('roundPosMoneyAmount: en yakın 250', () => {
    expect(roundPosMoneyAmount(12255)).toBe(12250);
    expect(roundPosMoneyAmount(12376)).toBe(12500);
    expect(roundPosMoneyAmount(12610)).toBe(12500);
    expect(roundPosMoneyAmount(12760)).toBe(12750);
    expect(roundPosMoneyAmount(15000)).toBe(15000);
  });

  it('roundPosDiscountAmountUp: yukarı 250', () => {
    expect(roundPosDiscountAmountUp(1)).toBe(250);
    expect(roundPosDiscountAmountUp(250)).toBe(250);
    expect(roundPosDiscountAmountUp(251)).toBe(500);
    expect(roundPosDiscountAmountUp(1025)).toBe(1250);
  });

  it('lineNetAfterPercentDiscount: satır neti 250 kademede', () => {
    expect(lineNetAfterPercentDiscount(10000, 10)).toBe(9000);
    expect(lineNetAfterPercentDiscount(10255, 0)).toBe(10250);
    expect(lineNetAfterPercentDiscount(10255, 0) % POS_DISCOUNT_MONETARY_STEP).toBe(0);
  });

  it('küçük pozitif tutarlar (birim fiyat) tam IQD kalır', () => {
    expect(roundPosMoneyAmount(1)).toBe(1);
    expect(roundPosMoneyAmount(124)).toBe(124);
    expect(roundPosMoneyAmount(127)).toBe(250);
  });

  it('USD için roundPosMoneyAmount delegasyonu', () => {
    expect(roundPosMoneyAmount(12.345, 'USD')).toBe(12.35);
  });

  it('posPaymentAdditionalDiscount: yüzde gerçek oran (USD)', () => {
    expect(posPaymentAdditionalDiscount(1518, 20, 'percentage', 'USD')).toBe(303.6);
    expect(posPaymentAdditionalDiscount(1518, 20, 'percentage', 'USD')).toBeCloseTo(1518 * 0.2, 5);
    const net = 1518 - posPaymentAdditionalDiscount(1518, 20, 'percentage', 'USD');
    expect(net).toBeCloseTo(1214.4, 5);
  });

  it('posPaymentAdditionalDiscount: tutar modu IQD 250 yukarı', () => {
    expect(posPaymentAdditionalDiscount(10000, 251, 'amount', 'IQD')).toBe(500);
  });

  it('lineDiscountMoneyFromPercent: USD yüzde gerçek oran', () => {
    expect(lineDiscountMoneyFromPercent(1518, 20, 'USD')).toBe(303.6);
  });

  it('lineDiscountMoneyFromPercent: IQD yüzde 250 yukarı', () => {
    expect(lineDiscountMoneyFromPercent(1518, 20, 'IQD')).toBe(500);
  });

  it('getPosQuickDiscountAmountPresets', () => {
    expect(getPosQuickDiscountAmountPresets('USD')).toEqual([1, 5, 10, 20, 50, 100]);
    expect(getPosQuickDiscountAmountPresets('IQD')).toEqual([1000, 5000, 10000]);
  });
});

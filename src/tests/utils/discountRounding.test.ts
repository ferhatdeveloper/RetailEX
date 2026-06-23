import { describe, it, expect } from 'vitest';
import {
  roundPosMoneyAmount,
  roundPosDiscountAmountUp,
  lineNetAfterPercentDiscount,
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

  it('USD için roundPosMoneyAmount delegasyonu', () => {
    expect(roundPosMoneyAmount(12.345, 'USD')).toBe(12.35);
  });
});

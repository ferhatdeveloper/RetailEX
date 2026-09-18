import { describe, expect, it } from 'vitest';
import { markupPercentFromPrices, salePriceFromMarkupPercent } from '../../utils/productProfitMargin';

describe('productProfitMargin markup %', () => {
  it('150% alış 10000 → satış 25000 (IQD tam sayı)', () => {
    expect(salePriceFromMarkupPercent(10000, 150, 'IQD')).toBe(25000);
    expect(markupPercentFromPrices(10000, 25000)).toBe(150);
  });

  it('0% satış = alış; maliyeti değiştirmez', () => {
    expect(salePriceFromMarkupPercent(10000, 0, 'IQD')).toBe(10000);
  });

  it('alış 0 iken satış üretmez', () => {
    expect(salePriceFromMarkupPercent(0, 150, 'IQD')).toBe(0);
    expect(markupPercentFromPrices(0, 25000)).toBe(0);
  });

  it('IQD ondalığı yuvarlar (0 hane)', () => {
    expect(salePriceFromMarkupPercent(10000, 33.3, 'IQD')).toBe(13330);
  });

  it('USD 2 hane yuvarlar', () => {
    expect(salePriceFromMarkupPercent(10, 12.5, 'USD')).toBe(11.25);
  });
});

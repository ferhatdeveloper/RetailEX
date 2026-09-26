import { describe, expect, it } from 'vitest';
import {
  productCardUnitCost,
  stockValueAtCardCost,
  SQL_PRODUCT_CARD_UNIT_COST,
} from './productCardUnitCost';

describe('productCardUnitCost', () => {
  it('cost > 0 ise cost kullanır', () => {
    expect(productCardUnitCost({ cost: 100, purchase_price: 80 })).toBe(100);
  });

  it('cost 0 iken purchase_price kullanır', () => {
    expect(productCardUnitCost({ cost: 0, purchase_price: 2500 })).toBe(2500);
    expect(productCardUnitCost({ cost: null, purchasePrice: 12 })).toBe(12);
  });

  it('satış fiyatı alanına düşmez — ikisi de 0 ise 0', () => {
    expect(productCardUnitCost({ cost: 0, purchase_price: 0 })).toBe(0);
  });

  it('stockValueAtCardCost = miktar × birim maliyet', () => {
    expect(stockValueAtCardCost(9, { cost: 0, purchase_price: 1000 })).toBe(9000);
    expect(stockValueAtCardCost(2, { cost: 500 })).toBe(1000);
  });

  it('SQL ifadesi cost sonra purchase_price içerir', () => {
    expect(SQL_PRODUCT_CARD_UNIT_COST).toContain('p.cost');
    expect(SQL_PRODUCT_CARD_UNIT_COST).toContain('p.purchase_price');
  });
});

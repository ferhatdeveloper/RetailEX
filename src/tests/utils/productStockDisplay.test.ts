import { describe, it, expect } from 'vitest';
import { isProductStockLow, isWeightBasedUnit } from '../../utils/productUnits';
import { formatScaleQuantityDisplay } from '../../utils/scaleQuantity';

describe('ürün listesi kg stok gösterimi', () => {
  it('Kilogram birimi ağırlık sayılır', () => {
    expect(isWeightBasedUnit('Kilogram')).toBe(true);
    expect(isWeightBasedUnit('KG')).toBe(true);
  });

  it('kg stok Türkçe 3 ondalık gösterilir (13.38 → 13,380)', () => {
    expect(formatScaleQuantityDisplay(13.38, 'Kilogram')).toBe('13,380');
    expect(formatScaleQuantityDisplay(74.64, 'KG')).toBe('74,640');
    expect(formatScaleQuantityDisplay(4.48, 'Kilogram')).toBe('4,480');
  });

  it('ağırlık biriminde sabit <10 eşiği kullanılmaz', () => {
    expect(isProductStockLow({ stock: 4.48, unit: 'Kilogram' })).toBe(false);
    expect(isProductStockLow({ stock: 0, unit: 'Kilogram' })).toBe(true);
    expect(isProductStockLow({ stock: 4.48, unit: 'Kilogram', minStock: 5 })).toBe(true);
    expect(isProductStockLow({ stock: 8, unit: 'Adet' })).toBe(true);
    expect(isProductStockLow({ stock: 12, unit: 'Adet' })).toBe(false);
  });
});

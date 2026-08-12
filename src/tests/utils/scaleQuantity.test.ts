import { describe, it, expect } from 'vitest';
import {
  formatScaleQuantityDisplay,
  mergeScaleCartQuantity,
  normalizeWeightProductQuantity,
  productQuantityToGrams,
  roundScaleQuantity,
  scaleGramsToProductQuantity,
  syncWeightLineQuantities,
} from '../../utils/scaleQuantity';

describe('scaleQuantity — alış 1,610 kg = tartı 1610 g', () => {
  it('1610 g → 1,610 kg (3 ondalık)', () => {
    expect(scaleGramsToProductQuantity(1610, 'KG')).toBe(1.61);
    expect(roundScaleQuantity(1.61)).toBe(1.61);
  });

  it('alış faturası 1,610 ile tartı satışı aynı gram', () => {
    const purchaseQty = normalizeWeightProductQuantity(1.61, 'KG');
    const saleQty = scaleGramsToProductQuantity(1610, 'KG');
    expect(purchaseQty).toBe(saleQty);
    expect(productQuantityToGrams(purchaseQty, 'KG')).toBe(1610);
    expect(productQuantityToGrams(saleQty, 'KG')).toBe(1610);
  });

  it('GR biriminde 1610 gram değişmez', () => {
    expect(scaleGramsToProductQuantity(1610, 'GR')).toBe(1610);
    expect(normalizeWeightProductQuantity(1610, 'GR')).toBe(1610);
  });

  it('gösterim: KG satırda 3 hane', () => {
    expect(formatScaleQuantityDisplay(1.61, 'KG')).toBe('1,610');
  });

  it('adet biriminde yuvarlama yapılmaz', () => {
    expect(normalizeWeightProductQuantity(5, 'Adet')).toBe(5);
  });

  it('syncWeightLineQuantities: miktar × çarpan = baseQuantity', () => {
    const synced = syncWeightLineQuantities(1.61, 'KG', 1);
    expect(synced).toEqual({ quantity: 1.61, baseQuantity: 1.61 });
  });

  it('mergeScaleCartQuantity: 1,61 + 1,61 = 3,22', () => {
    expect(mergeScaleCartQuantity(1.61, 1.61, 'KG')).toBe(3.22);
  });
});

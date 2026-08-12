import { describe, it, expect } from 'vitest';
import { parseDecimalStringForInput, parsePosQuantity, formatPosQuantityInput, formatWeightQuantityInput, parseInvoiceWeightQuantity } from '../../utils/numberFormatter';
import {
  hydrateWeightLineFromDb,
  mergeScaleCartQuantity,
  productQuantityToGrams,
  resolveStockQuantityFromLine,
  scaleGramsToProductQuantity,
  syncWeightLineQuantities,
} from '../../utils/scaleQuantity';

describe('scaleStockAlignment — alış 1,610 kg ↔ tartı 1610 g', () => {
  it('alış faturası TR virgül: 1,610 → 1,61 kg', () => {
    const parsed = parseDecimalStringForInput('1,610');
    const synced = syncWeightLineQuantities(parsed, 'KG', 1);
    expect(synced.quantity).toBe(1.61);
    expect(synced.baseQuantity).toBe(1.61);
  });

  it('tartı satış ile alış aynı gram stok etkisi', () => {
    const purchase = syncWeightLineQuantities(1.61, 'KG', 1);
    const sale = scaleGramsToProductQuantity(1610, 'KG');
    expect(productQuantityToGrams(purchase.baseQuantity, 'KG')).toBe(1610);
    expect(productQuantityToGrams(sale, 'KG')).toBe(1610);
    expect(purchase.baseQuantity).toBe(sale);
  });

  it('sepet birleştirme: 1,610 + 1,610 = 3,22 kg', () => {
    expect(mergeScaleCartQuantity(1.61, 1.61, 'KG')).toBe(3.22);
  });

  it('POS satır stok miktarı baseQuantity ile', () => {
    expect(
      resolveStockQuantityFromLine({
        quantity: 1.61,
        unit: 'KG',
        multiplier: 1,
        baseQuantity: 1.61,
      }),
    ).toBe(1.61);
  });

  it('DB yükleme: quantity ve baseQuantity hizalı', () => {
    const h = hydrateWeightLineFromDb({
      quantity: 1.61,
      baseQuantity: 1.61,
      unit: 'KG',
      multiplier: 1,
    });
    expect(h.quantity).toBe(1.61);
    expect(h.baseQuantity).toBe(1.61);
  });

  it('GR biriminde 1610 gram stok', () => {
    const synced = syncWeightLineQuantities(1610, 'GR', 1);
    expect(synced.baseQuantity).toBe(1610);
    expect(scaleGramsToProductQuantity(1610, 'GR')).toBe(1610);
  });
});

describe('formatWeightQuantityInput — alış faturası miktar', () => {
  it('2,250 yazımı korunur ve parse edilir (2 kg 250 g)', () => {
    expect(formatWeightQuantityInput('2,250')).toBe('2,250');
    expect(parseInvoiceWeightQuantity('2,250')).toBe(2.25);
  });

  it('yazarken virgül silinmez: 2,', () => {
    expect(formatWeightQuantityInput('2,')).toBe('2,');
    expect(parseInvoiceWeightQuantity('2,')).toBeNaN();
  });

  it('2250 binlik noktaya çevrilmez', () => {
    expect(formatWeightQuantityInput('2250')).toBe('2250');
  });

  it('nokta ondalık: 2.250 → 2,250', () => {
    expect(formatWeightQuantityInput('2.250')).toBe('2,250');
    expect(parseInvoiceWeightQuantity('2,250')).toBe(2.25);
  });
});

describe('parsePosQuantity — numpad kg girişi', () => {
  it('TR virgül: 1,415 kg', () => {
    expect(parsePosQuantity('1,415')).toBe(1.415);
  });

  it('nokta ondalık (tartı): 1.415 → 1,415 kg (1415 değil)', () => {
    expect(parsePosQuantity('1.415')).toBe(1.415);
    expect(parseDecimalStringForInput('1.415')).toBe(1415);
  });

  it('nokta ondalık: 69.500 → 69,5 kg (69500 değil)', () => {
    expect(parsePosQuantity('69.500')).toBe(69.5);
    expect(parseDecimalStringForInput('69.500')).toBe(69500);
  });

  it('99.999 kg nokta — 99999 birleştirmesi olmasın', () => {
    expect(parsePosQuantity('99.999')).toBe(99.999);
    expect(parseDecimalStringForInput('99.999')).toBe(99999);
  });
});

describe('formatPosQuantityInput — numpad kg', () => {
  it('1.415 yazımı → 1,415 gösterim', () => {
    expect(formatPosQuantityInput('1.415', true)).toBe('1,415');
  });
});

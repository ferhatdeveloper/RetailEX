import { describe, it, expect, beforeEach } from 'vitest';
import {
  convertWeight,
  parseBarcode,
  parseBarcodeVariants,
  scaleSaleUnitLabel,
  isWeightBasedBarcode,
} from '../../utils/barcodeParser';
import { getScaleBarcodeType, setScaleBarcodeType } from '../../utils/scaleBarcodeConfig';

describe('barcodeParser — tartılı barkod', () => {
  beforeEach(() => {
    setScaleBarcodeType(99);
  });

  it('Rongta tip 99 / 17: prefix 27 + PLU 00001 + 1250 gram', () => {
    const parsed = parseBarcode('2700001012500');
    expect(parsed.isWeightBased).toBe(true);
    expect(parsed.format).toBe('rongta_type99');
    expect(parsed.rongtaTypeHint).toBe(99);
    expect(parsed.productCode).toBe('00001');
    expect(parsed.weight).toBe(1250);
  });

  it('Rongta tip 19: prefix 29 + PLU + gram', () => {
    const parsed = parseBarcode('2900001012500');
    expect(parsed.productCode).toBe('00001');
    expect(parsed.weight).toBe(1250);
  });

  it('parseBarcodeVariants: 6 haneli PLU alternatifi', () => {
    const variants = parseBarcodeVariants('2700001012500');
    expect(variants.length).toBeGreaterThanOrEqual(1);
    expect(variants[0].productCode).toBe('00001');
  });

  it('Logo Tiger: 4 haneli PLU + gram', () => {
    const parsed = parseBarcode('2000010125001');
    expect(parsed.format).toBe('logo_tiger');
    expect(parsed.productCode).toBe('0001');
    expect(parsed.weight).toBe(1250);
  });

  it('Fiyat bazlı barkod (prefix 23)', () => {
    const parsed = parseBarcode('2312345012990');
    expect(parsed.isPriceBased).toBe(true);
    expect(parsed.isWeightBased).toBe(false);
    expect(parsed.productCode).toBe('12345');
    expect(parsed.price).toBe(1299);
  });

  it('Prefix 25 artık ağırlık barkodu (tip 15)', () => {
    const parsed = parseBarcode('2500010125000');
    expect(parsed.isWeightBased).toBe(true);
    expect(parsed.productCode).toBe('000101');
  });

  it('Normal 13 haneli barkod tartılı sayılmaz', () => {
    expect(parseBarcode('8690000000001').isWeightBased).toBe(false);
  });

  it('convertWeight gram → kg', () => {
    expect(convertWeight(1250, 'KG')).toBe(1.25);
  });

  it('isWeightBasedBarcode', () => {
    expect(isWeightBasedBarcode('2700001012500')).toBe(true);
    expect(isWeightBasedBarcode('2312345012990')).toBe(false);
  });

  it('varsayılan barkod tipi 99', () => {
    expect(getScaleBarcodeType()).toBe(99);
  });
});

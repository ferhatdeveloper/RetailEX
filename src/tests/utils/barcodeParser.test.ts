import { describe, it, expect } from 'vitest';
import {
  convertWeight,
  parseBarcode,
  scaleSaleUnitLabel,
  isWeightBasedBarcode,
} from '../../utils/barcodeParser';

describe('barcodeParser — tartılı barkod', () => {
  it('Rongta tip 27: PLU 00001 + 1250 gram', () => {
    const parsed = parseBarcode('2700001012500');
    expect(parsed.isWeightBased).toBe(true);
    expect(parsed.format).toBe('rongta_gs1');
    expect(parsed.productCode).toBe('00001');
    expect(parsed.weight).toBe(1250);
  });

  it('Rongta tip 27: PLU 00001 + 350 gram', () => {
    const parsed = parseBarcode('2700001003500');
    expect(parsed.productCode).toBe('00001');
    expect(parsed.weight).toBe(350);
  });

  it('Logo Tiger: 4 haneli PLU + gram', () => {
    const parsed = parseBarcode('2000010125001');
    expect(parsed.format).toBe('logo_tiger');
    expect(parsed.productCode).toBe('0001');
    expect(parsed.weight).toBe(1250);
  });

  it('Fiyat bazlı barkod ağırlık değildir', () => {
    const parsed = parseBarcode('2312345012990');
    expect(parsed.isPriceBased).toBe(true);
    expect(parsed.isWeightBased).toBe(false);
    expect(parsed.productCode).toBe('12345');
    expect(parsed.price).toBe(1299);
  });

  it('Normal 13 haneli barkod tartılı sayılmaz', () => {
    const parsed = parseBarcode('8690000000001');
    expect(parsed.isWeightBased).toBe(false);
  });

  it('convertWeight gram → kg satış miktarı', () => {
    expect(convertWeight(1250, 'KG')).toBe(1.25);
    expect(convertWeight(1250, 'GR')).toBe(1.25);
  });

  it('isWeightBasedBarcode hızlı kontrol', () => {
    expect(isWeightBasedBarcode('2700001012500')).toBe(true);
    expect(isWeightBasedBarcode('2312345012990')).toBe(false);
    expect(isWeightBasedBarcode('8690000000001')).toBe(false);
  });

  it('scaleSaleUnitLabel GR birimini KG olarak gösterir', () => {
    expect(scaleSaleUnitLabel('GR')).toBe('KG');
    expect(scaleSaleUnitLabel('KG')).toBe('KG');
  });
});

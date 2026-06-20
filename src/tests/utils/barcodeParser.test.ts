import { describe, it, expect, beforeEach } from 'vitest';
import {
  convertWeight,
  parseBarcode,
  parseBarcodeVariants,
  rongtaWeightFieldToKg,
  isWeightBasedBarcode,
} from '../../utils/barcodeParser';
import { getScaleBarcodeType, setScaleBarcodeType } from '../../utils/scaleBarcodeConfig';

describe('barcodeParser — tartılı barkod', () => {
  beforeEach(() => {
    setScaleBarcodeType(99);
  });

  it('Rongta tip 99 / 17: prefix 27 + PLU 00001 + 1,300 kg (01300)', () => {
    const parsed = parseBarcode('2700001013000');
    expect(parsed.isWeightBased).toBe(true);
    expect(parsed.format).toBe('rongta_type99');
    expect(parsed.productCode).toBe('00001');
    expect(parsed.weight).toBe(1300);
    expect(rongtaWeightFieldToKg(parsed.weight!)).toBe(1.3);
  });

  it('PLU tip 27: dept 2 + PLU 000001 + 1,300 kg — Logo Tiger değil', () => {
    const parsed = parseBarcode('2000001013000');
    expect(parsed.format).toBe('rongta_dept_plu6');
    expect(parsed.productCode).toBe('000001');
    expect(parsed.weight).toBe(1300);
    expect(rongtaWeightFieldToKg(parsed.weight!)).toBe(1.3);
  });

  it('2000001013000 Logo Tiger olsaydı ~10 kg okunurdu (regresyon)', () => {
    const wrongWeight = parseInt('2000001013000'.substring(6, 11), 10);
    expect(rongtaWeightFieldToKg(wrongWeight)).toBeGreaterThan(9);
    expect(rongtaWeightFieldToKg(1300)).toBe(1.3);
  });

  it('Rongta tip 19: prefix 29 + PLU + ağırlık', () => {
    const parsed = parseBarcode('2900001012500');
    expect(parsed.productCode).toBe('00001');
    expect(parsed.weight).toBe(1250);
    expect(rongtaWeightFieldToKg(parsed.weight!)).toBe(1.25);
  });

  it('parseBarcodeVariants: prefix 27 + dept+6 alternatifleri', () => {
    const variants = parseBarcodeVariants('2700001013000');
    expect(variants.length).toBeGreaterThanOrEqual(1);
    expect(variants[0].productCode).toBe('00001');
  });

  it('Fiyat bazlı barkod (prefix 23)', () => {
    const parsed = parseBarcode('2312345012990');
    expect(parsed.isPriceBased).toBe(true);
    expect(parsed.productCode).toBe('12345');
    expect(parsed.price).toBe(1299);
  });

  it('Prefix 25 ağırlık barkodu (tip 15)', () => {
    const parsed = parseBarcode('2500010125000');
    expect(parsed.isWeightBased).toBe(true);
    expect(parsed.productCode).toBe('000101');
  });

  it('Normal 13 haneli barkod tartılı sayılmaz', () => {
    expect(parseBarcode('8690000000001').isWeightBased).toBe(false);
  });

  it('convertWeight → rongtaWeightFieldToKg', () => {
    expect(convertWeight(1300)).toBe(1.3);
    expect(convertWeight(1250)).toBe(1.25);
  });

  it('isWeightBasedBarcode', () => {
    expect(isWeightBasedBarcode('2700001013000')).toBe(true);
    expect(isWeightBasedBarcode('2000001013000')).toBe(true);
    expect(isWeightBasedBarcode('2312345012990')).toBe(false);
  });

  it('varsayılan barkod tipi 99', () => {
    expect(getScaleBarcodeType()).toBe(99);
  });
});

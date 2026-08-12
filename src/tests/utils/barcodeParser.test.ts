import { describe, it, expect, beforeEach } from 'vitest';
import {
  convertPrice,
  convertWeight,
  expandScaleBarcodeCandidates,
  expandBarcodeLookupKeys,
  parseBarcode,
  parseBarcodeVariants,
  rongtaWeightFieldToKg,
  scaleWeightFieldToQuantity,
  isWeightBasedBarcode,
} from '../../utils/barcodeParser';
import { roundMoneyAmount } from '../../utils/currency';
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

  it('10000000381415 → kod 1000000038, 1415 g', () => {
    const parsed = parseBarcode('10000000381415');
    expect(parsed.format).toBe('code10_weight');
    expect(parsed.productCode).toBe('1000000038');
    expect(parsed.weight).toBe(1415);
    const kg = scaleWeightFieldToQuantity(parsed.weight!, 'KG', 'code10_weight');
    expect(kg.quantity).toBe(1.415);
  });

  it('10000000441415 → kod 1000000044, 1415 g', () => {
    const parsed = parseBarcode('10000000441415');
    expect(parsed.format).toBe('code10_weight');
    expect(parsed.productCode).toBe('1000000044');
    expect(parsed.weight).toBe(1415);
    const kg = scaleWeightFieldToQuantity(parsed.weight!, 'KG', 'code10_weight');
    expect(kg.quantity).toBe(1.415);
  });

  it('10000000091610 → kod 1000000009, 1610 g', () => {
    const parsed = parseBarcode('10000000091610');
    expect(parsed.isWeightBased).toBe(true);
    expect(parsed.format).toBe('code10_weight');
    expect(parsed.productCode).toBe('1000000009');
    expect(parsed.weight).toBe(1610);
    const kg = scaleWeightFieldToQuantity(parsed.weight!, 'KG', 'code10_weight');
    expect(kg.quantity).toBe(1.61);
    expect(kg.unitName).toBe('KG');
  });

  it('13 hane code10: 1000000009 + 161 gram', () => {
    const parsed = parseBarcode('1000000009161');
    expect(parsed.format).toBe('code10_weight');
    expect(parsed.productCode).toBe('1000000009');
    expect(parsed.weight).toBe(161);
    const gr = scaleWeightFieldToQuantity(parsed.weight!, 'GR', 'code10_weight');
    expect(gr.quantity).toBe(161);
    expect(gr.unitName).toBe('GR');
  });

  it('code10 öncelikli: 1000001013000 hâlâ dept+PLU6 (sonek 000)', () => {
    const parsed = parseBarcode('1000001013000');
    expect(parsed.format).toBe('rongta_dept_plu6');
    expect(parsed.productCode).toBe('000001');
  });

  it('expandScaleBarcodeCandidates: 14 hane code10 13 haneye bölünmez', () => {
    const candidates = expandScaleBarcodeCandidates('10000000091610');
    expect(candidates).toEqual(['10000000091610']);
  });

  it('14 hane GR birimi: ağırlık alanı gram olarak kalır', () => {
    const gr = scaleWeightFieldToQuantity(1610, 'GR');
    expect(gr.quantity).toBe(1610);
    expect(gr.unitName).toBe('GR');
  });

  it('Ürün kodu 100000001: dept 1 + PLU 000001 + 1,300 kg', () => {
    const parsed = parseBarcode('1000001013000');
    expect(parsed.isWeightBased).toBe(true);
    expect(parsed.format).toBe('rongta_dept_plu6');
    expect(parsed.productCode).toBe('000001');
    expect(parsed.weight).toBe(1300);
    expect(rongtaWeightFieldToKg(parsed.weight!)).toBe(1.3);
  });

  it('100000001 sabit ürün kodu tartılı etiket değil', () => {
    expect(parseBarcode('100000001').isWeightBased).toBe(false);
    expect(parseBarcodeVariants('100000001')).toHaveLength(0);
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
    expect(isWeightBasedBarcode('10000000091610')).toBe(true);
    expect(isWeightBasedBarcode('2700001013000')).toBe(true);
    expect(isWeightBasedBarcode('2000001013000')).toBe(true);
    expect(isWeightBasedBarcode('2312345012990')).toBe(false);
  });

  it('varsayılan barkod tipi 99', () => {
    expect(getScaleBarcodeType()).toBe(99);
  });

  it('convertPrice IQD: barkod alanı doğrudan tam dinar', () => {
    expect(convertPrice(1299, 'IQD')).toBe(1299);
    expect(convertPrice(15000, 'IQD')).toBe(15000);
  });

  it('convertPrice USD: alan cent/kuruş (÷100)', () => {
    expect(convertPrice(1299, 'USD')).toBe(12.99);
  });

  it('tartılı satır IQD: 1,3 kg × 15.000 IQD/kg = 19.500', () => {
    const qty = rongtaWeightFieldToKg(1300);
    expect(qty).toBe(1.3);
    expect(roundMoneyAmount(qty * 15000, 'IQD')).toBe(19500);
  });

  it('expandBarcodeLookupKeys: UPC-A 12 hane ve EAN-13 baştaki 0', () => {
    expect(expandBarcodeLookupKeys('033844002084')).toEqual(
      expect.arrayContaining(['033844002084', '33844002084', '0033844002084']),
    );
  });
});

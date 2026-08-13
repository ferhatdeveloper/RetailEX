import { describe, it, expect } from 'vitest';
import type { Product } from '../../core/types';
import type { ParsedBarcode } from '../../utils/barcodeParser';
import { buildScaleCartLineAmounts } from '../../utils/scaleBarcodeLine';

const baseProduct: Product = {
  id: '1',
  code: '1000000009',
  name: 'Tartılı ürün',
  price: 1000,
  unit: 'KG',
  currency: 'IQD',
  isScaleProduct: true,
};

const code10Parsed: ParsedBarcode = {
  isWeightBased: true,
  productCode: '1000000009',
  weight: 1610,
  originalBarcode: '10000000091610',
  format: 'code10_weight',
  code10SuffixMode: 'weight_grams',
};

describe('scaleBarcodeLine', () => {
  it('code10 gram: 1610 g × 1000 IQD/kg → satır 250 kademeye yuvarlanır', () => {
    const line = buildScaleCartLineAmounts(baseProduct, code10Parsed, 1310);
    expect(line).not.toBeNull();
    expect(line!.quantity).toBe(1.61);
    expect(line!.lineTotal).toBe(1500);
    expect(line!.unitPrice).toBe(1000);
  });

  it('total_iqd: sonek doğrudan satır tutarı (250 kademe)', () => {
    const parsed: ParsedBarcode = {
      ...code10Parsed,
      code10SuffixMode: 'total_iqd',
    };
    const line = buildScaleCartLineAmounts(baseProduct, parsed, 1310);
    expect(line!.lineTotal).toBe(1500);
    expect(line!.quantity).toBe(1.5);
  });

  it('GR birimi: 1610 gr — satır tutarı 250 kademe', () => {
    const grProduct = { ...baseProduct, unit: 'GR' };
    const line = buildScaleCartLineAmounts(grProduct, code10Parsed, 1310);
    expect(line!.quantity).toBe(1610);
    expect(line!.unitName).toBe('GR');
    expect(line!.lineTotal).toBe(1500);
  });

  it('priceList1 > price: etiket/liste fiyatı öncelikli olur (MarketPOS 13750 ↔ etiket 14000 senaryosu)', () => {
    const product = { ...baseProduct, price: 13750, priceList1: 14000 } as Product;
    const parsed: ParsedBarcode = { ...code10Parsed, weight: 380 };
    const line = buildScaleCartLineAmounts(product, parsed, 1310);
    expect(line).not.toBeNull();
    expect(line!.quantity).toBe(0.38);
    expect(line!.unitPrice).toBe(14000);
    expect(line!.lineTotal).toBe(roundToStep(0.38 * 14000, 250));
  });

  it('USD otomatik: priceList1 doluysa liste fiyatı kazanır', () => {
    const product = {
      ...baseProduct,
      price: 13750,
      priceList1: 14000,
      autoCalculateUSD: true,
      salePriceUSD: 10,
      customExchangeRate: 1.31,
    } as Product;
    const parsed: ParsedBarcode = { ...code10Parsed, weight: 380 };
    const line = buildScaleCartLineAmounts(product, parsed, 1310);
    expect(line!.unitPrice).toBe(14000);
  });

  it('USD otomatik: priceList1=0 ise saleUsd × kur kullanılır', () => {
    const product = {
      ...baseProduct,
      price: 0,
      priceList1: 0,
      autoCalculateUSD: true,
      salePriceUSD: 10,
      customExchangeRate: 1.31,
    } as Product;
    const parsed: ParsedBarcode = { ...code10Parsed, weight: 380 };
    const line = buildScaleCartLineAmounts(product, parsed, 1310);
    expect(line!.unitPrice).toBe(13100);
  });
});

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

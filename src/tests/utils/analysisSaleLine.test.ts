import { describe, expect, it } from 'vitest';
import {
  addAnalysisSplitAmount,
  classifyAnalysisSaleLine,
  resolveAnalysisSaleCategory,
} from '../../utils/analysisSaleLine';

const products = [
  { id: 'p-1', code: 'SKU1', name: 'Şampuan', isService: false, category: 'Kozmetik' },
  { id: 'svc-erp', code: 'HIZ-1', name: 'Danışmanlık', isService: true, materialType: 'service' as const, category: 'Hizmetler' },
];

const beautyServices = [
  { id: 'b-laser-1', name: 'Lazer tam vücut', parent_category: 'laser', category: 'full_body' },
];

const tm = (key: string) =>
  ({
    bCatLaser: 'Lazer Epilasyon',
    bCatOther: 'Diğer',
  }[key] || key);

describe('classifyAnalysisSaleLine', () => {
  it('satır türü Hizmet / service / package ise hizmet sayar', () => {
    expect(classifyAnalysisSaleLine({ lineType: 'Hizmet', productId: 'x' }, products)).toBe('service');
    expect(classifyAnalysisSaleLine({ item_type: 'service', productId: 'x' }, products)).toBe('service');
    expect(classifyAnalysisSaleLine({ item_type: 'package', productId: 'x' }, products)).toBe('service');
  });

  it('ürün kartı isService ise hizmet sayar', () => {
    expect(classifyAnalysisSaleLine({ productId: 'svc-erp', lineType: 'Malzeme' }, products)).toBe('service');
  });

  it('güzellik hizmet id veya beauty-service öneki hizmettir', () => {
    const keys = new Set(['b-laser-1']);
    expect(classifyAnalysisSaleLine({ productId: 'b-laser-1' }, products, keys)).toBe('service');
    expect(classifyAnalysisSaleLine({ productId: 'beauty-service-Lazer' }, products)).toBe('service');
    expect(classifyAnalysisSaleLine({ productId: 'beauty-product-Şampuan' }, products)).toBe('product');
  });

  it('bilinen malzeme satırı üründür — hizmet ile çift sayılmaz', () => {
    expect(classifyAnalysisSaleLine({ productId: 'p-1', lineType: 'Malzeme' }, products)).toBe('product');
    expect(classifyAnalysisSaleLine({ productId: 'p-1', item_type: 'product' }, products)).toBe('product');
  });
});

describe('resolveAnalysisSaleCategory', () => {
  it('ürün kategorisini kullanır', () => {
    expect(
      resolveAnalysisSaleCategory({ productId: 'p-1' }, products, beautyServices, {
        other: 'Diğer',
        service: 'Hizmet',
        tm,
      }),
    ).toBe('Kozmetik');
  });

  it('güzellik hizmetini Diğer yerine ana kategoriye koyar', () => {
    expect(
      resolveAnalysisSaleCategory({ productId: 'b-laser-1', item_type: 'service' }, products, beautyServices, {
        other: 'Diğer',
        service: 'Hizmet',
        tm,
      }),
    ).toBe('Lazer Epilasyon');
  });

  it('kategorisiz hizmet satırında Hizmet yedeği kullanır', () => {
    expect(
      resolveAnalysisSaleCategory({ productId: 'unknown-svc', lineType: 'Hizmet' }, products, [], {
        other: 'Diğer',
        service: 'Hizmet',
        tm,
      }),
    ).toBe('Hizmet');
  });

  it('hizmet anahtarı varken ürün kartı yoksa Diğer yerine Hizmet yazar', () => {
    const keys = new Set(['b-unknown']);
    expect(
      resolveAnalysisSaleCategory(
        { productId: 'b-unknown' },
        products,
        [],
        { other: 'Diğer', service: 'Hizmet', tm },
        keys,
      ),
    ).toBe('Hizmet');
  });
});

describe('addAnalysisSplitAmount', () => {
  it('hizmet ve ürünü ayrı toplar, iade negatif işareti korur, çift yazmaz', () => {
    const map = new Map();
    addAnalysisSplitAmount(map, '2026-09', 'service', 100000);
    addAnalysisSplitAmount(map, '2026-09', 'product', 30000);
    addAnalysisSplitAmount(map, '2026-09', 'service', -5000);
    const row = map.get('2026-09')!;
    expect(row.service).toBe(95000);
    expect(row.product).toBe(30000);
    expect(row.service + row.product).toBe(125000);
  });
});

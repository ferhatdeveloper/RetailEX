import { describe, expect, it } from 'vitest';
import { defaultReportMenuParams } from '../../services/reportMenuParamsService';
import {
  findInsufficientStockHits,
  formatInsufficientStockMessage,
  isBlockNegativeStockSaleEnabled,
  isStockExemptFromSaleGuard,
  wouldCauseNegativeOrZeroShortage,
} from '../../utils/stockSaleGuard';

describe('stockSaleGuard', () => {
  it('varsayılan engel kapalı = satılabilir', () => {
    const defaults = defaultReportMenuParams();
    expect(defaults['block-negative-stock-sale']).toBe(false);
    expect(isBlockNegativeStockSaleEnabled(defaults)).toBe(false);
    expect(
      isBlockNegativeStockSaleEnabled({
        ...defaults,
        'block-negative-stock-sale': true,
      }),
    ).toBe(true);
    expect(
      isBlockNegativeStockSaleEnabled({
        ...defaults,
        'block-negative-stock-sale': false,
      }),
    ).toBe(false);
  });

  it('hizmet ürününü engelden muaf tutar', () => {
    expect(isStockExemptFromSaleGuard({ isService: true })).toBe(true);
    expect(isStockExemptFromSaleGuard({ materialType: 'service' })).toBe(true);
    expect(isStockExemptFromSaleGuard({ materialType: 'commercial_goods' })).toBe(false);
    expect(isStockExemptFromSaleGuard({}, 'Hizmet')).toBe(true);
  });

  it('stok 0 iken pozitif talep yetersiz sayılır', () => {
    expect(wouldCauseNegativeOrZeroShortage(0, 1)).toBe(true);
    expect(wouldCauseNegativeOrZeroShortage(5, 5)).toBe(false);
    expect(wouldCauseNegativeOrZeroShortage(5, 6)).toBe(true);
  });

  it('aynı ürün satırlarını toplar', () => {
    const hits = findInsufficientStockHits([
      { productId: 'a', name: 'A', quantity: 3, availableStock: 4 },
      { productId: 'a', name: 'A', quantity: 2, availableStock: 4 },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.requestedQty).toBe(5);
    expect(hits[0]?.projectedStock).toBe(-1);
  });

  it('hizmet satırını atlar', () => {
    const hits = findInsufficientStockHits([
      {
        productId: 's1',
        name: 'Kesim',
        quantity: 10,
        availableStock: 0,
        isService: true,
      },
    ]);
    expect(hits).toHaveLength(0);
  });

  it('uyarı metni stokta yok / negatif mesajı üretir', () => {
    const tm = (k: string) =>
      ({
        stockSaleOutOfStock: 'Stokta ürün yok',
        stockSaleNegativeNotAllowed: 'Negatif seviye kayıt yapılamaz',
        stockSaleOutOfStockDetail: '• {name}: stokta yok',
        stockSaleNegativeDetail: '• {name}: mevcut {available}, talep {requested}',
        stockSaleMoreItems: '… ve {count} ürün daha',
      }[k] || k);

    const zero = formatInsufficientStockMessage(
      [{ productId: '1', name: 'Su', availableStock: 0, requestedQty: 1, projectedStock: -1 }],
      tm,
    );
    expect(zero).toContain('Stokta ürün yok');
    expect(zero).toContain('Su');

    const neg = formatInsufficientStockMessage(
      [{ productId: '2', name: 'Çay', availableStock: 2, requestedQty: 5, projectedStock: -3 }],
      tm,
    );
    expect(neg).toContain('Negatif seviye kayıt yapılamaz');
    expect(neg).toContain('mevcut 2');
  });
});

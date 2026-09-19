import { describe, expect, it } from 'vitest';
import {
  computePriceDriftCandidates,
  latestSlipPriceByProduct,
  pricesDiffer,
} from '../../utils/priceChangeSlipDrift';

describe('priceChangeSlipDrift', () => {
  it('ürün başına en yeni fiş tarihini alır', () => {
    const last = latestSlipPriceByProduct(
      [
        { id: 'm1', movement_date: '2026-01-01T00:00:00.000Z' },
        { id: 'm2', movement_date: '2026-06-01T00:00:00.000Z' },
      ],
      [
        { movement_id: 'm1', product_id: 'p1', cost_price: 10, unit_price: 20 },
        { movement_id: 'm2', product_id: 'p1', cost_price: 12, unit_price: 25 },
      ],
    );
    expect(last.get('p1')).toEqual({ cost: 12, price: 25 });
  });

  it('kart ile son fiş aynıysa sapma üretmez', () => {
    const last = new Map([['p1', { cost: 10, price: 20 }]]);
    expect(
      computePriceDriftCandidates(last, [{ id: 'p1', code: 'A', name: 'El kremi', cost: 10, price: 20 }]),
    ).toEqual([]);
  });

  it('alış veya satış farkında sapma satırı üretir', () => {
    const last = new Map([['p1', { cost: 10, price: 20 }]]);
    const rows = computePriceDriftCandidates(last, [
      { id: 'p1', code: 'EK-1', name: 'El kremi', unit: 'Adet', cost: 11, price: 20 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].product_code).toBe('EK-1');
    expect(rows[0].current_cost).toBe(11);
    expect(rows[0].last_slip_cost).toBe(10);
  });

  it('küçük yuvarlama farkını sapma saymaz', () => {
    expect(pricesDiffer(10, 10.00000001)).toBe(false);
    expect(pricesDiffer(10, 10.01)).toBe(true);
  });
});

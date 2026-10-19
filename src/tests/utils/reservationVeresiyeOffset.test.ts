import { describe, expect, it } from 'vitest';
import { offsetSaleRemainingWithReservation } from '../../utils/reservationVeresiyeOffset';

describe('offsetSaleRemainingWithReservation', () => {
  it('50.000 belge, 35.000 nakit, 15.000 rezervasyon → veresiye 0', () => {
    const map = offsetSaleRemainingWithReservation(
      [{ id: 's1', customerId: 'c1', remaining: 15000 }],
      [{ customerId: 'c1', amount: 15000, status: 'open' }],
      new Map(),
    );
    expect(map.get('s1')).toBe(0);
  });

  it('rezervasyondan fazla kalan gerçek veresiyedir', () => {
    const map = offsetSaleRemainingWithReservation(
      [{ id: 's1', customerId: 'c1', remaining: 20000 }],
      [{ customerId: 'c1', amount: 15000, status: 'open' }],
      new Map(),
    );
    expect(map.get('s1')).toBe(5000);
  });

  it('uygulanmış avansı ikinci kez düşmez', () => {
    const map = offsetSaleRemainingWithReservation(
      [{ id: 's1', customerId: 'c1', remaining: 0 }],
      [{ customerId: 'c1', amount: 15000, status: 'applied', appliedSaleId: 's1' }],
      new Map([['s1', 15000]]),
    );
    expect(map.get('s1')).toBe(0);
  });

  it('başka müşterinin rezervasyonu veresiyeyi kapatmaz', () => {
    const map = offsetSaleRemainingWithReservation(
      [
        { id: 's1', customerId: 'c1', remaining: 15000 },
        { id: 's2', customerId: 'c2', remaining: 0 },
      ],
      [{ customerId: 'c2', amount: 15000, status: 'open' }],
      new Map(),
    );
    expect(map.get('s1')).toBe(15000);
  });
});
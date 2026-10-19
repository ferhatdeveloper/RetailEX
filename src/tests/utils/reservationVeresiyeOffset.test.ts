import { describe, expect, it } from 'vitest';
import {
  absorbReservationFromRemainings,
  dailyVeresiyeAfterReservation,
  detachReservationFromOpenAccount,
  offsetSaleRemainingWithReservation,
  reservationOutsideSaleSplit,
  reservationRegisterTopUp,
} from '../../utils/reservationVeresiyeOffset';

describe('dailyVeresiyeAfterReservation', () => {
  it('rezervasyon tutarı veresiyeden düşer', () => {
    expect(dailyVeresiyeAfterReservation(15000, 15000)).toBe(0);
  });

  it('rezervasyondan büyük kalan gerçek veresiyedir', () => {
    expect(dailyVeresiyeAfterReservation(40000, 15000)).toBe(25000);
  });

  it('rezervasyon kalandan büyükse veresiye sıfırdır', () => {
    expect(dailyVeresiyeAfterReservation(0, 15000)).toBe(0);
  });
});

describe('absorbReservationFromRemainings', () => {
  it('tek satışın 15.000 kalanını rezervasyon kapatır', () => {
    const map = absorbReservationFromRemainings([{ id: 's1', remaining: 15000 }], 15000);
    expect(map.get('s1')).toBe(0);
  });

  it('satış kırılımına yazılmış avansı ikinci kez düşmez', () => {
    const map = absorbReservationFromRemainings(
      [{ id: 's1', remaining: 20000, appliedCredited: 15000 }],
      15000,
    );
    expect(map.get('s1')).toBe(20000);
    expect(reservationOutsideSaleSplit(15000, 15000)).toBe(0);
  });
});

describe('reservationRegisterTopUp', () => {
  it('35.000 hizmet tahsilatı + 15.000 rezervasyon → kasaya 15.000 eklenir', () => {
    expect(reservationRegisterTopUp({
      avansCashShown: 15000,
      avansCardShown: 0,
      appliedCashIncrease: 0,
      cashLineReservation: 0,
    })).toEqual({ cash: 15000, card: 0 });
  });

  it('kasa satırı ile avans kartı aynı tutarı iki kez yazmaz', () => {
    expect(reservationRegisterTopUp({
      avansCashShown: 15000,
      avansCardShown: 0,
      appliedCashIncrease: 0,
      cashLineReservation: 15000,
    })).toEqual({ cash: 15000, card: 0 });
  });

  it('satış nakitine işlenmiş avansı tekrar eklemez', () => {
    expect(reservationRegisterTopUp({
      avansCashShown: 15000,
      avansCardShown: 0,
      appliedCashIncrease: 15000,
      cashLineReservation: 15000,
    })).toEqual({ cash: 0, card: 0 });
  });
});

describe('detachReservationFromOpenAccount', () => {
  it('açık cariden rezervasyonu çıkarır, nakit toplamını bozmaz', () => {
    const out = detachReservationFromOpenAccount({
      openAccount: 15000,
      distributionTotal: 50000,
      reservationOutsideSplit: 15000,
    });
    expect(out.openAccount).toBe(0);
    expect(out.distributionTotal).toBe(35000);
    expect(out.removed).toBe(15000);
  });
});

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
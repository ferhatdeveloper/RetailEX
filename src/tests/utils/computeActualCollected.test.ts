/**
 * computeActualCollected — güzellik/rapor Ciro = "tahsil edilen nakit"
 * Bug-fix 2026-10-11: raporlar hizmet tam tutarını (50.000) yansıtıyordu;
 * Ciro = bugün tahsil edilen nakit olmalı.
 *
 * Senaryo — Ferhat 10.10.2026:
 *   09:00 ROZA  Sadece Peşinat  50.000  deposit  5.000   → ciro 5.000
 *   10:00 ARAM  Sadece Peşinat  50.000  deposit 10.000   → ciro 10.000
 *   11:00 ARAM  Tamamlandı      50.000  deposit 35.000 remainder 0 → ciro 35.000
 *   15:00 ?     —               50.000  deposit 20.000  → ciro 20.000
 *   TOPLAM                                                       = 70.000
 */
import { describe, expect, it } from 'vitest';
import {
  appointmentCollected,
  saleCollected,
  sumCollected,
} from '../../utils/computeActualCollected';

describe('appointmentCollected — Randevudan Ciro', () => {
  it('Sadece Peşinat: total=50k, deposit=5k, remainder=0 → ciro=5k', () => {
    expect(
      appointmentCollected({
        total_price: 50000,
        deposit_amount: 5000,
        remainder_paid_amount: 0,
        status: 'scheduled',
      })
    ).toBe(5000);
  });

  it('Sadece Peşinat (pre_paid): total=50k, deposit=10k → ciro=10k', () => {
    expect(
      appointmentCollected({
        total_price: 50000,
        deposit_amount: 10000,
        remainder_paid_amount: 0,
        status: 'pre_paid',
      })
    ).toBe(10000);
  });

  it('Tamamlandı: total=50k, deposit=35k, remainder=0 → ciro=35k', () => {
    expect(
      appointmentCollected({
        total_price: 50000,
        deposit_amount: 35000,
        remainder_paid_amount: 0,
        status: 'completed',
      })
    ).toBe(35000);
  });

  it('Tamamlandı + remainder: total=50k, deposit=20k, remainder=15k → ciro=35k', () => {
    expect(
      appointmentCollected({
        total_price: 50000,
        deposit_amount: 20000,
        remainder_paid_amount: 15000,
        status: 'completed',
      })
    ).toBe(35000);
  });

  it('İptal: ciro=0', () => {
    expect(
      appointmentCollected({
        total_price: 50000,
        deposit_amount: 30000,
        status: 'cancelled',
      })
    ).toBe(0);
  });

  it('no_show: ciro=0', () => {
    expect(
      appointmentCollected({
        total_price: 50000,
        deposit_amount: 5000,
        status: 'no_show',
      })
    ).toBe(0);
  });

  it('paid_amount öncelikli: 75k ödendi (paid_amount=75000) → ciro=75k', () => {
    // Verifyanda DB güncel tahsilat rakamı öncelikli
    expect(
      appointmentCollected({
        total_price: 50000,
        deposit_amount: 30000,
        remainder_paid_amount: 0,
        paid_amount: 75000,
        status: 'completed',
      })
    ).toBe(75000);
  });

  it('deposit > total cap: total=30k, deposit=50k → ciro=30k (sınır)', () => {
    expect(
      appointmentCollected({
        total_price: 30000,
        deposit_amount: 50000,
        status: 'pre_paid',
      })
    ).toBe(30000);
  });

  it('negatif paid_amount: abs kullanılır → ciro=0', () => {
    expect(
      appointmentCollected({
        total_price: 50000,
        deposit_amount: 0,
        paid_amount: -100,
        status: 'cancelled',
      })
    ).toBe(0); // iptal önce, paid_amount fallback yok
  });
});

describe('saleCollected — Sale satırından Ciro', () => {
  it('veresiye → ciro=0', () => {
    expect(
      saleCollected({
        total: 50000,
        payment_method: 'veresiye',
        status: 'pending',
      })
    ).toBe(0);
  });

  it('peşin nakit → ciro = total', () => {
    expect(
      saleCollected({
        total: 50000,
        payment_method: 'cash',
        status: 'paid',
      })
    ).toBe(50000);
  });

  it('kısmi peşin (paid_amount=30000) → ciro=30000', () => {
    expect(
      saleCollected({
        total: 50000,
        paid_amount: 30000,
        remaining_amount: 20000,
        status: 'paid',
      })
    ).toBe(30000);
  });

  it('iptal fiş: ciro=0', () => {
    expect(
      saleCollected({
        total: 50000,
        deposit_amount: 30000,
        payment_status: 'cancelled',
      })
    ).toBe(0);
  });

  it('İade (negatif total, paid_amount=null, completed): Ciro belki negatif döner (iade düşüşü)', () => {
    // İade satırı brüt-negatif Ciro'dan düşer; tahsil edilen nakit negatif = iade miktarı.
    expect(
      saleCollected({
        total: -5000,
        total_price: -5000,
        status: 'paid',
      })
    ).toBe(-5000);
  });
});

describe('sumCollected — saatlik/günlük toplam', () => {
  it('Senaryo — Ferhat örneği (4 randevu): 5k+10k+35k+20k = 70k', () => {
    const apts = [
      { total_price: 50000, deposit_amount: 5000, status: 'pre_paid' },
      { total_price: 50000, deposit_amount: 10000, status: 'pre_paid' },
      { total_price: 50000, deposit_amount: 35000, status: 'completed' },
      { total_price: 50000, deposit_amount: 20000, status: 'completed' },
    ];
    const total = apts.reduce((s, a) => s + appointmentCollected(a), 0);
    expect(total).toBe(70000);
  });

  it('iptal randevu toplamı düşürür', () => {
    const apts = [
      { total_price: 50000, deposit_amount: 5000, status: 'pre_paid' },
      { total_price: 50000, deposit_amount: 30000, status: 'cancelled' },
    ];
    const total = apts.reduce((s, a) => s + appointmentCollected(a), 0);
    expect(total).toBe(5000);
  });

  it('sumCollected: sale listesi ile', () => {
    const sales = [
      { total: 50000, payment_method: 'cash', status: 'paid' },
      { total: 50000, payment_method: 'veresiye', status: 'pending' },
      { total: 50000, paid_amount: 35000, status: 'paid' },
    ];
    expect(sumCollected(sales)).toBe(85000); // 50000 + 0 + 35000
  });

  it('boş liste: 0', () => {
    expect(sumCollected([])).toBe(0);
  });
});

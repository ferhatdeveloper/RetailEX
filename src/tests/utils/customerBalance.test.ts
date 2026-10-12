/**
 * Müşteri Yönetimi — 3 parçalı bakiye (Gerçek Bakiye + Avans + Toplam Harcama)
 *
 * 11.10.2026 — Kullanıcı şikâyeti (ROZA / ARAM):
 * Bakiye ekranı müşterinin gerçek borcunu ve bekleyen rezervasyon
 * peşinatını ayrı göstermiyor; bu yüzden "henüz hizmet verilmemiş
 * avans" borç gibi görünüyordu. Bu test `computeCustomerBalance`
 * helper'ının semantiğini korur.
 */

import { describe, expect, it } from 'vitest';
import {
  computeCustomerBalance,
  balanceColorClass,
  computeAppointmentRemainder,
  computeKalan,
} from '../../utils/customerBalance';

describe('computeCustomerBalance — 3 parçalı müşteri bakiyesi', () => {
  it('ROZA: balance=-10.000, pending=10.000 → realBalance=0, avans=10.000', () => {
    // Kullanıcının ekranında ROZA -10.000 görünüyordu. Aslında 10.000
    // peşinat alınmış, hizmet verilmemiş → gerçek bakiye 0, avans 10.000.
    const r = computeCustomerBalance({ balance: -10000, pendingDeposit: 10000 });
    expect(r.realBalance).toBe(0);
    expect(r.pendingDeposit).toBe(10000);
  });

  it('ARAM: balance=-35.000, pending=35.000 → realBalance=0, avans=35.000', () => {
    const r = computeCustomerBalance({ balance: -35000, pendingDeposit: 35000 });
    expect(r.realBalance).toBe(0);
    expect(r.pendingDeposit).toBe(35000);
  });

  it('Gerçek borç: balance=50.000, pending=0 → realBalance=50.000 (kırmızı)', () => {
    // Müşteri hiç avans ödememiş, hizmet verildi → tam borç bakiyede.
    const r = computeCustomerBalance({ balance: 50000, pendingDeposit: 0 });
    expect(r.realBalance).toBe(50000);
    expect(r.pendingDeposit).toBe(0);
  });

  it('Hizmet tamamlandı, kalan ödenmedi: balance=-20.000 → realBalance=-20.000 (yeşil/alacak)', () => {
    // Müşteri peşin ödedi, kalan 20.000 ödenmedi → müşteri alacaklı.
    const r = computeCustomerBalance({ balance: -20000, pendingDeposit: 0 });
    expect(r.realBalance).toBe(-20000);
  });

  it('Kısmi avans: balance=-20.000, pending=10.000 → realBalance=-10.000', () => {
    // 50.000 hizmet + 10.000 avans + 40.000 kalan nakit (peşin).
    // Ledger'da müşteri alacağı 20.000 görünüyor (peşinat düşülmüş).
    // effective = -20.000 + 10.000 = -10.000 (10.000 avansı geri ekle).
    const r = computeCustomerBalance({ balance: -20000, pendingDeposit: 10000 });
    expect(r.realBalance).toBe(-10000);
  });

  it('null / undefined / NaN güvenli — 0 kabul eder', () => {
    expect(computeCustomerBalance({}).realBalance).toBe(0);
    expect(computeCustomerBalance({ balance: null, pendingDeposit: undefined }).realBalance).toBe(0);
    expect(
      computeCustomerBalance({
        balance: NaN as unknown as number,
        pendingDeposit: NaN as unknown as number,
      }).realBalance,
    ).toBe(0);
  });

  it('string number coerce — "100" → 100', () => {
    const r = computeCustomerBalance({
      balance: '100' as unknown as number,
      pendingDeposit: '50' as unknown as number,
    });
    expect(r.realBalance).toBe(150);
  });

  it('totalSpent bağımsız taşınır', () => {
    const r = computeCustomerBalance({
      balance: -10000,
      pendingDeposit: 10000,
      totalSpent: 250000,
    });
    expect(r.realBalance).toBe(0);
    expect(r.pendingDeposit).toBe(10000);
    expect(r.totalSpent).toBe(250000);
  });
});

describe('balanceColorClass — görsel token', () => {
  it('borçlu (pozitif) → kırmızı, alacaklı (negatif) → yeşil, 0 → gri', () => {
    expect(balanceColorClass(50_000)).toBe('text-red-600');
    expect(balanceColorClass(-20_000)).toBe('text-emerald-600');
    expect(balanceColorClass(0)).toBe('text-gray-500');
  });
  it('eşik altı (0.005) nötr sayılır — yuvarlama gürültüsü', () => {
    expect(balanceColorClass(0.004)).toBe('text-gray-500');
    expect(balanceColorClass(-0.004)).toBe('text-gray-500');
  });
});

describe('computeCustomerBalance — kullanıcı senaryosu (ROZA / ARAM)', () => {
  it('aynı satır 0 bakiye + mavi avans badge gösterir', () => {
    // Kullanıcının istediği: ROZA / ARAM satırında
    //   Bakiye: 0 IQD       (gri)
    //   Avans: 10.000 IQD    (mavi badge)
    const rows = [
      { name: 'ROZA', balance: -10000, pendingDeposit: 10000 },
      { name: 'ARAM', balance: -35000, pendingDeposit: 35000 },
      { name: 'BORCLU', balance: 50000, pendingDeposit: 0 },
      { name: 'ALACAKLI', balance: -20000, pendingDeposit: 0 },
    ];
    const result = rows.map((r) => ({
      name: r.name,
      ...computeCustomerBalance({
        balance: r.balance,
        pendingDeposit: r.pendingDeposit,
      }),
      color: balanceColorClass(
        computeCustomerBalance({
          balance: r.balance,
          pendingDeposit: r.pendingDeposit,
        }).realBalance,
      ),
    }));
    expect(result[0]).toMatchObject({ name: 'ROZA', realBalance: 0, pendingDeposit: 10000, color: 'text-gray-500' });
    expect(result[1]).toMatchObject({ name: 'ARAM', realBalance: 0, pendingDeposit: 35000, color: 'text-gray-500' });
    expect(result[2]).toMatchObject({ name: 'BORCLU', realBalance: 50000, pendingDeposit: 0, color: 'text-red-600' });
    expect(result[3]).toMatchObject({ name: 'ALACAKLI', realBalance: -20000, pendingDeposit: 0, color: 'text-emerald-600' });
  });
});

/**
 * 12.10.2026 — NIHAT müşteri detay sayfası bug'ı:
 * "TEK randevu var nasıl toplam 80.000 yapıyor" (50.000 hizmet +
 * 20.000 avans + 30.000 kalan ödeme; randevu completed; cari_avans
 * status=open).
 *
 * Kök neden: Kalan widget'ı status-aware değildi; completed randevuda
 * `total_price - deposit - remainder_paid` = 30.000 dönüyordu.
 * 50.000 (Toplam Harcama) + 30.000 (Kalan) = 80.000 çift sayım.
 *
 * Çözüm: `computeAppointmentRemainder` (alias `computeKalan`) status-aware —
 * tamamlanan / iptal edilen randevuda 0; aksi halde max(0, total - deposit -
 * remainder_paid).
 */
describe('computeAppointmentRemainder / computeKalan — randevu Kalan (12.10.2026 NIHAT bug)', () => {
  it('NIHAT bugün senaryosu: completed → Kalan = 0', () => {
    // 50k hizmet + 20k peşinat (avans) + 30k kalan ödeme (kasa_giris).
    // Randevu completed olduğu için Kalan = 0; gerçek ödeme kasa_giris'te.
    const apt = {
      total_price: 50_000,
      deposit_amount: 20_000,
      remainder_paid_amount: 30_000,
      status: 'completed',
    };
    expect(computeAppointmentRemainder(apt)).toBe(0);
    expect(computeKalan(apt)).toBe(0);
  });

  it('cancelled → Kalan = 0', () => {
    expect(
      computeAppointmentRemainder({
        total_price: 50_000,
        deposit_amount: 20_000,
        status: 'cancelled',
      }),
    ).toBe(0);
  });

  it('no_show → Kalan = 0', () => {
    expect(
      computeAppointmentRemainder({
        total_price: 80_000,
        deposit_amount: 30_000,
        status: 'no_show',
      }),
    ).toBe(0);
  });

  it('scheduled (henüz hizmet verilmemiş) → max(0, total - deposit)', () => {
    // 50k hizmet + 20k peşinat alınmış, hizmet verilmemiş → 30k kalan.
    expect(
      computeAppointmentRemainder({
        total_price: 50_000,
        deposit_amount: 20_000,
        remainder_paid_amount: 0,
        status: 'scheduled',
      }),
    ).toBe(30_000);
  });

  it('scheduled + kısmi kalan ödeme → fark doğru', () => {
    // 50k hizmet + 20k peşinat + 10k kalan nakit (henüz 20k kalan).
    expect(
      computeAppointmentRemainder({
        total_price: 50_000,
        deposit_amount: 20_000,
        remainder_paid_amount: 10_000,
        status: 'scheduled',
      }),
    ).toBe(20_000);
  });

  it('overpaid → 0 (clamp)', () => {
    expect(
      computeAppointmentRemainder({
        total_price: 50_000,
        deposit_amount: 30_000,
        remainder_paid_amount: 25_000,
        status: 'scheduled',
      }),
    ).toBe(0);
  });

  it('status null/undefined → scheduled muamelesi (pozitif fark döner)', () => {
    expect(
      computeAppointmentRemainder({
        total_price: 50_000,
        deposit_amount: 20_000,
      }),
    ).toBe(30_000);
  });

  it('null/undefined alanlar güvenli (defansif)', () => {
    expect(computeAppointmentRemainder({})).toBe(0);
    expect(
      computeAppointmentRemainder({
        total_price: null,
        deposit_amount: undefined,
        remainder_paid_amount: NaN,
        status: 'completed',
      }),
    ).toBe(0);
  });

  it('büyük-küçük harf ve whitespace toleransı (status)', () => {
    expect(
      computeAppointmentRemainder({
        total_price: 50_000,
        deposit_amount: 20_000,
        status: '  COMPLETED  ',
      }),
    ).toBe(0);
  });
});

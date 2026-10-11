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

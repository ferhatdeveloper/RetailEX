/**
 * Müşteri Yönetimi — Bakiye kolonu (avans hariç effective balance).
 *
 * 10.10.2026 — Kullanıcı şikâyeti (ROZA):
 * Müşteri Yönetimi tablosunda ROZA bakiye -10.000 görünüyordu;
 * bekleyen avans 10.000 düşülmüyordu. Cari Hesap Özeti ile aynı
 * semantikte olması için `effectiveBalance = balance + pendingDeposit`
 * formülü uygulandı (3fd0690b recvAvansHariç ile aynı).
 */

import { describe, expect, it } from 'vitest';
import {
  customerEffectiveBalance,
  isDisplayableBalance,
  MIN_BALANCE_DISPLAY,
} from '../../utils/customerEffectiveBalance';

describe('customerEffectiveBalance — Müşteri Yönetimi bakiye (avans hariç)', () => {
  it('ROZA: balance=-10000, pendingDeposit=10000 → effective=0 (peşin kapandı)', () => {
    // Senaryo: 10.000 hizmet + 10.000 avans (REZERVASYON) → peşin kapandı.
    // `customers.balance` avansı içermez → -10.000; pendingDeposit 10.000.
    // Effective = -10.000 + 10.000 = 0 → ekranda "—" gösterilir.
    const out = customerEffectiveBalance({ balance: -10000, pendingDeposit: 10000 });
    expect(out).toBe(0);
    expect(isDisplayableBalance(out)).toBe(false);
  });

  it('ARA: balance=-5000, pendingDeposit=5000 → effective=0', () => {
    const out = customerEffectiveBalance({ balance: -5000, pendingDeposit: 5000 });
    expect(out).toBe(0);
    expect(isDisplayableBalance(out)).toBe(false);
  });

  it('avans yoksa ham balance etkilenmez', () => {
    // 3. müşteri senaryosu — borçlu müşteri, avansı yok.
    // Bakiye değişmemeli: 100 IQD.
    const out = customerEffectiveBalance({ balance: 100, pendingDeposit: 0 });
    expect(out).toBe(100);
    expect(isDisplayableBalance(out)).toBe(true);
  });

  it('hizmet verildi, avans kısmen kullanıldı → kalan alacak görünür', () => {
    // Senaryo: 50.000 hizmet + 10.000 avans + 40.000 kalan nakit → peşin
    // kapandı → effective 0. Bu test alt versiyonu:
    // balance=-20000, pendingDeposit=10000 → effective=-10000.
    // (Hizmet verildi, avans düşüldü, kalan 10.000 müşteri alacağı.)
    const out = customerEffectiveBalance({ balance: -20000, pendingDeposit: 10000 });
    expect(out).toBe(-10000);
    expect(isDisplayableBalance(out)).toBe(true);
  });

  it('null/undefined güvenli — 0 kabul eder', () => {
    expect(customerEffectiveBalance({ balance: null, pendingDeposit: undefined })).toBe(0);
    expect(customerEffectiveBalance({ balance: undefined, pendingDeposit: 0 })).toBe(0);
    expect(customerEffectiveBalance({ balance: 0, pendingDeposit: 0 })).toBe(0);
  });

  it('NaN koruması — number coercion ile 0 döner', () => {
    // `Number(NaN) || 0` → 0. Defensive.
    const out = customerEffectiveBalance({ balance: NaN as unknown as number, pendingDeposit: NaN as unknown as number });
    expect(Number.isFinite(out)).toBe(true);
    expect(out).toBe(0);
  });

  it('string number coerce — "100" → 100', () => {
    // DB'den bazen string gelebilir; Number coercion güvenli.
    const out = customerEffectiveBalance({ balance: '100' as unknown as number, pendingDeposit: '50' as unknown as number });
    expect(out).toBe(150);
  });

  it('MIN_BALANCE_DISPLAY eşiği altında "—" gösterilir', () => {
    // 0.004 < 0.005 → gizli
    expect(isDisplayableBalance(0.004)).toBe(false);
    expect(isDisplayableBalance(-0.004)).toBe(false);
    // Eşik üstünde
    expect(isDisplayableBalance(0.006)).toBe(true);
    expect(isDisplayableBalance(-0.006)).toBe(true);
    expect(MIN_BALANCE_DISPLAY).toBe(0.005);
  });
});

describe('customerEffectiveBalance — kullanıcı senaryosu (ROZA + ARA + düz cari)', () => {
  it('üçü durdum birden, doğru sıralama ve gösterim', () => {
    // Kullanıcının ekran gördüğü tablo:
    //   ROZA: balance=-10.000, pendingDeposit=10.000 → "—"
    //   ARA:  balance=-5.000,  pendingDeposit=5.000  → "—"
    //   Ali:  balance=100,     pendingDeposit=0      → 100 IQD (B)
    const rows = [
      { name: 'ROZA', balance: -10000, pendingDeposit: 10000 },
      { name: 'ARA', balance: -5000, pendingDeposit: 5000 },
      { name: 'Ali', balance: 100, pendingDeposit: 0 },
    ];
    const result = rows.map((r) => ({
      name: r.name,
      effective: customerEffectiveBalance(r),
      display: isDisplayableBalance(customerEffectiveBalance(r)),
    }));
    expect(result[0]).toEqual({ name: 'ROZA', effective: 0, display: false });
    expect(result[1]).toEqual({ name: 'ARA', effective: 0, display: false });
    expect(result[2]).toEqual({ name: 'Ali', effective: 100, display: true });
  });
});
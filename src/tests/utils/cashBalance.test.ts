/**
 * cashBalance.test.ts — kasa bakiyesi snapshot yerine cash_lines toplamı.
 *
 * Amaç — `cash_registers.balance` snapshot'ı yalnızca `fn_auto_cash_line_on_sale`
 * ile gelen KASA_GIRIS satırlarında güncelleniyor; manuel çıkışlar
 * (GIDER_PUSULASI / MAAS_ODEME / CH_ODEME / ORTAK_SERMAYE_ODEME / AVANS_ODEME)
 * yansımıyor → büyük rapor sapmaları (eski örnek: 691M).
 *
 * Bu test, `computeCashBalance` helper'ının snapshot'tan bağımsız olarak
 * gerçek bakiyeyi Σ |tutar| × sign(islem_tipi) formülüyle doğru hesapladığını
 * doğrular.
 */

import { describe, it, expect } from 'vitest';
import {
  computeCashBalance,
  computeCashBalanceForRegister,
} from '../../utils/cashBalance';
import type { KasaIslemi } from '../../services/api/kasa';

function mk(partial: Partial<KasaIslemi> & Pick<KasaIslemi, 'islem_tipi' | 'tutar'>): KasaIslemi {
  return {
    firma_id: '001',
    kasa_id: 'reg-merkez',
    islem_tarihi: '2026-10-03',
    ...partial,
  } as KasaIslemi;
}

describe('computeCashBalance — Σ |tutar| × sign(islem_tipi)', () => {
  it('KASA_GIRIS (+1) ve GIDER_PUSULASI / MAAS_ODEME (-1) doğru toplanır', () => {
    // 100K giriş + 30K gider + 50K maaş = 100K − 30K − 50K = 20K
    const lines: KasaIslemi[] = [
      mk({ islem_tipi: 'KASA_GIRIS', tutar: 100_000 }),
      mk({ islem_tipi: 'GIDER_PUSULASI', tutar: 30_000 }),
      mk({ islem_tipi: 'MAAS_ODEME', tutar: 50_000 }),
    ];
    expect(computeCashBalance(lines)).toBe(20_000);
  });

  it('CH_ODEME, ORTAK_SERMAYE_ODEME, AVANS_ODEME de çıkış olarak sayılır', () => {
    // 200K giriş − 50K CH_ODEME − 25K ORTAK_SERMAYE_ODEME − 10K AVANS_ODEME = 115K
    const lines: KasaIslemi[] = [
      mk({ islem_tipi: 'KASA_GIRIS', tutar: 200_000 }),
      mk({ islem_tipi: 'CH_ODEME', tutar: 50_000 }),
      mk({ islem_tipi: 'ORTAK_SERMAYE_ODEME', tutar: 25_000 }),
      mk({ islem_tipi: 'AVANS_ODEME', tutar: 10_000 }),
    ];
    expect(computeCashBalance(lines)).toBe(115_000);
  });

  it('boş / null / undefined listeler 0 döner', () => {
    expect(computeCashBalance([])).toBe(0);
    expect(computeCashBalance(undefined as unknown as KasaIslemi[])).toBe(0);
    expect(computeCashBalance(null as unknown as KasaIslemi[])).toBe(0);
  });

  it('tutar=0 olan satırlar yoksayılır', () => {
    const lines: KasaIslemi[] = [
      mk({ islem_tipi: 'KASA_GIRIS', tutar: 1000 }),
      mk({ islem_tipi: 'GIDER_PUSULASI', tutar: 0 }),
    ];
    expect(computeCashBalance(lines)).toBe(1000);
  });

  it('negatif bakiye: giderler girişlerden büyükse sonuç negatif olur', () => {
    const lines: KasaIslemi[] = [
      mk({ islem_tipi: 'KASA_GIRIS', tutar: 10_000 }),
      mk({ islem_tipi: 'MAAS_ODEME', tutar: 40_000 }),
    ];
    expect(computeCashBalance(lines)).toBe(-30_000);
  });
});

describe('computeCashBalanceForRegister — tek kasa için filtreli toplam', () => {
  it('yalnızca eşleşen kasa_id satırlarını toplar', () => {
    const lines: KasaIslemi[] = [
      mk({ kasa_id: 'reg-a', islem_tipi: 'KASA_GIRIS', tutar: 100_000 }),
      mk({ kasa_id: 'reg-b', islem_tipi: 'KASA_GIRIS', tutar: 50_000 }),
      mk({ kasa_id: 'reg-a', islem_tipi: 'GIDER_PUSULASI', tutar: 30_000 }),
    ];
    expect(computeCashBalanceForRegister('reg-a', lines)).toBe(70_000);
    expect(computeCashBalanceForRegister('reg-b', lines)).toBe(50_000);
    expect(computeCashBalanceForRegister('reg-yok', lines)).toBe(0);
  });

  it('registerId boş ise 0 döner', () => {
    const lines: KasaIslemi[] = [
      mk({ kasa_id: 'reg-a', islem_tipi: 'KASA_GIRIS', tutar: 100_000 }),
    ];
    expect(computeCashBalanceForRegister(undefined, lines)).toBe(0);
    expect(computeCashBalanceForRegister('', lines)).toBe(0);
    expect(computeCashBalanceForRegister(null, lines)).toBe(0);
  });
});
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

describe('kasa kartı — açılış, giriş, virman, gider', () => {
  it('açılış 0 + giriş 10.000 + çıkış 0 = bakiye 10.000', () => {
    const lines: KasaIslemi[] = [
      mk({
        kasa_id: 'kasa-001',
        islem_tipi: 'CH_TAHSILAT',
        tutar: 10_000,
        sign: 1,
        ozel_kod: 'REZERVASYON',
        is_reservation_deposit: true,
        islem_aciklamasi: 'Rezervasyon tahsilatı',
      }),
    ];
    expect(computeCashBalance(lines)).toBe(10_000);
    expect(computeCashBalanceForRegister('kasa-001', lines)).toBe(10_000);
    expect(computeCashBalance(lines)).not.toBe(20_000);
  });

  it('ACILIS_ALACAK bakiyeyi düşürür, ACILIS_BORC artırır', () => {
    const lines: KasaIslemi[] = [
      mk({ islem_tipi: 'ACILIS_ALACAK', tutar: 38_500, sign: -1 }),
      mk({ islem_tipi: 'ACILIS_BORC', tutar: 10_000, sign: 1 }),
      mk({ islem_tipi: 'CH_TAHSILAT', tutar: 10_000, sign: 1 }),
    ];
    expect(computeCashBalance(lines)).toBe(-18_500);
  });

  it('virman şirket nakdini değiştirmez: kaynak −, hedef +', () => {
    const lines: KasaIslemi[] = [
      mk({
        kasa_id: 'kasa-001',
        target_register_id: 'zain',
        islem_tipi: 'VIRMAN',
        tutar: 40_000,
        sign: -1,
        islem_no: 'VRM-40',
      }),
      mk({
        kasa_id: 'zain',
        target_register_id: 'kasa-001',
        islem_tipi: 'VIRMAN',
        tutar: 40_000,
        sign: 1,
        islem_no: 'VRM-40-VRM',
      }),
    ];
    expect(computeCashBalance(lines)).toBe(0);
    expect(computeCashBalanceForRegister('kasa-001', lines)).toBe(-40_000);
    expect(computeCashBalanceForRegister('zain', lines)).toBe(40_000);
  });

  it('gider bir kez düşer', () => {
    const lines: KasaIslemi[] = [
      mk({ islem_tipi: 'CH_TAHSILAT', tutar: 10_000, sign: 1 }),
      mk({
        id: 'kira-1',
        islem_tipi: 'GIDER_PUSULASI',
        tutar: 50_000,
        sign: -1,
        islem_aciklamasi: 'KIRA',
      }),
    ];
    expect(computeCashBalance(lines)).toBe(-40_000);
    expect(computeCashBalance(lines)).not.toBe(-90_000);
  });
});
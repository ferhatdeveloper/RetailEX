/**
 * Kasa İşlemleri (CH tahsilat/ödeme) düzenle + sil — kasa bakiyesi.
 * Senaryo: açılış 100.000, hatalı 450.000 tahsilat → 45.000 düzelt → sil → 100.000.
 */
import { describe, it, expect } from 'vitest';
import {
  computeKasaIslemiSign,
  effectiveKasaPostedSign,
  kasaIslemiPostedCash,
  kasaIslemiBalanceDeltaOnUpdate,
  kasaIslemiBalanceDeltaOnDelete,
  kasaIslemiCariDeltaOnUpdate,
  cashRegisterDeltasOnUpdate,
} from './kasa';

describe('CH tahsilat/ödeme işaretleri', () => {
  it('CH_TAHSILAT kasaya +1, CH_ODEME kasaya -1', () => {
    expect(computeKasaIslemiSign('CH_TAHSILAT')).toBe(1);
    expect(computeKasaIslemiSign('CH_ODEME')).toBe(-1);
  });

  it('sign 0/NULL ise tip işaretini kullanır (eski 450k terslensin)', () => {
    expect(effectiveKasaPostedSign(0, 'CH_TAHSILAT')).toBe(1);
    expect(effectiveKasaPostedSign(null, 'CH_TAHSILAT')).toBe(1);
    expect(effectiveKasaPostedSign(undefined, 'CH_ODEME')).toBe(-1);
    expect(effectiveKasaPostedSign(1, 'CH_TAHSILAT')).toBe(1);
    expect(effectiveKasaPostedSign(-1, 'CH_ODEME')).toBe(-1);
  });
});

describe('450k→45k tahsilat sonra sil → açılış', () => {
  it('düzenleme bakiyeye −405k (eski +450k tam ters, yeni +45k bir kez)', () => {
    const oldSign = effectiveKasaPostedSign(1, 'CH_TAHSILAT');
    const newSign = computeKasaIslemiSign('CH_TAHSILAT');
    const delta = kasaIslemiBalanceDeltaOnUpdate(450000, oldSign, 45000, newSign);
    expect(delta).toBe(-405000);
    expect(cashRegisterDeltasOnUpdate('kasa-1', 'kasa-1', 450000, 45000)).toEqual([
      { registerId: 'kasa-1', delta: -405000 },
    ]);
  });

  it('sign=0 kayıtlı olsa bile 450k→45k −405k (hayalet 450k kalmasın)', () => {
    const oldSign = effectiveKasaPostedSign(0, 'CH_TAHSILAT');
    const newSign = computeKasaIslemiSign('CH_TAHSILAT');
    expect(kasaIslemiBalanceDeltaOnUpdate(450000, oldSign, 45000, newSign)).toBe(-405000);
  });

  it("silme ledger tutarini 45k tersler, eski 450k eklenmez", () => {
    expect(kasaIslemiBalanceDeltaOnDelete(45000, 1)).toBe(-45000);
    expect(kasaIslemiPostedCash(45000, 1)).toBe(45000);
  });

  it('açılış 100k + 450k tahsilat → 45k düzelt → sil = 100k', () => {
    let bal = 100000;
    bal += kasaIslemiPostedCash(450000, 1);
    expect(bal).toBe(550000);
    bal += kasaIslemiBalanceDeltaOnUpdate(450000, 1, 45000, 1);
    expect(bal).toBe(145000);
    bal += kasaIslemiBalanceDeltaOnDelete(45000, 1);
    expect(bal).toBe(100000);
  });

  it('BUG matematiği: edit nakit güncellemezse silme 505k bırakır', () => {
    let bal = 100000;
    bal += 450000;
    // satır 45k oldu, kasa 550k kaldı
    bal += kasaIslemiBalanceDeltaOnDelete(45000, 1);
    expect(bal).toBe(505000);
  });
});

describe('CH ödeme işaret simetrisi', () => {
  it('450k→45k ödeme bakiyeye +405k (çıkış azalır)', () => {
    expect(kasaIslemiBalanceDeltaOnUpdate(450000, -1, 45000, -1)).toBe(405000);
  });

  it('açılış 100k + 450k ödeme → 45k düzelt → sil = 100k', () => {
    let bal = 100000;
    bal += kasaIslemiPostedCash(450000, -1);
    expect(bal).toBe(-350000);
    bal += kasaIslemiBalanceDeltaOnUpdate(450000, -1, 45000, -1);
    expect(bal).toBe(55000);
    bal += kasaIslemiBalanceDeltaOnDelete(45000, -1);
    expect(bal).toBe(100000);
  });
});

describe('cari çift kayıt (tahsilat açık bakiyeyi düşürür)', () => {
  it('450k→45k tahsilat caride +405k (fazla düşüş geri)', () => {
    expect(kasaIslemiCariDeltaOnUpdate(450000, 'CH_TAHSILAT', 45000, 'CH_TAHSILAT')).toBe(405000);
  });

  it('gider tipi cariye 0', () => {
    expect(kasaIslemiCariDeltaOnUpdate(450000, 'GIDER_PUSULASI', 45000, 'GIDER_PUSULASI')).toBe(0);
  });
});

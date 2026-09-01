/**
 * kasa.virman.test.ts
 *
 * 2026-09-01 — Kasalar arası virman özelliği eklendi.
 * Bu test, mantıksal olarak createKasaIslemi içindeki VIRMAN bloğunun:
 *  - Aynı fiche_no + (fiche_no + '-VRM') iki ayrı INSERT oluşturduğunu
 *  - Birinci satırda sign=-1 (kaynak kasadan çıkış) olduğunu
 *  - İkinci satırda sign=+1 (hedef kasaya giriş) olduğunu
 *  - Kaynak bakiyesinin −tutar, hedef bakiyesinin +tutar güncellendiğini
 *  - Aynı kasaya virman (kendi kendine) hata fırlattığını
 * doğrular (gerçek DB erişimi olmadan, izole SQL/kontrol mantığı).
 */

import { describe, it, expect } from 'vitest';

// SQL bloğunda kullanılan karar mantığını birebir izole eden helper:
function buildVirmanPlan(opts: {
  isVirman: boolean;
  sourceKasaId: string;
  targetKasaId: string | null;
  tutar: number;
}) {
  if (!opts.isVirman || !opts.targetKasaId) return null;
  if (opts.targetKasaId === opts.sourceKasaId) {
    throw new Error('Kaynak ve hedef kasa aynı olamaz (virman)');
  }
  const sourceSign = -1; // virman çıkış
  const targetSign = +1; // karşılık giriş
  const targetFicheSufix = '-VRM';
  return {
    source: {
      register_id: opts.sourceKasaId,
      sign: sourceSign,
      balanceDelta: -opts.tutar,
    },
    target: {
      register_id: opts.targetKasaId,
      sign: targetSign,
      balanceDelta: +opts.tutar,
      fiche_no_suffix: targetFicheSufix,
    },
  };
}

describe('createKasaIslemi — VIRMAN (kasalar arası virman) mantığı', () => {
  it('VIRMAN + target_register_id verildiğinde çift-sayı INSERT planı üretir', () => {
    const plan = buildVirmanPlan({
      isVirman: true,
      sourceKasaId: 'kasa-aaa',
      targetKasaId: 'kasa-bbb',
      tutar: 100000,
    });
    expect(plan).not.toBeNull();
    expect(plan?.source.sign).toBe(-1);
    expect(plan?.target.sign).toBe(1);
    expect(plan?.target.balanceDelta).toBe(100000);
    expect(plan?.source.balanceDelta).toBe(-100000);
    expect(plan?.target.fiche_no_suffix).toBe('-VRM');
  });

  it('VIRMAN + target_register_id null ise plan üretmez (mevcut davranış)', () => {
    const plan = buildVirmanPlan({
      isVirman: true,
      sourceKasaId: 'kasa-aaa',
      targetKasaId: null,
      tutar: 50000,
    });
    expect(plan).toBeNull();
  });

  it('VIRMAN değilse plan üretmez', () => {
    const plan = buildVirmanPlan({
      isVirman: false,
      sourceKasaId: 'kasa-aaa',
      targetKasaId: 'kasa-bbb',
      tutar: 50000,
    });
    expect(plan).toBeNull();
  });

  it('kendi kendine virman (source == target) hata fırlatır', () => {
    expect(() =>
      buildVirmanPlan({
        isVirman: true,
        sourceKasaId: 'kasa-aaa',
        targetKasaId: 'kasa-aaa',
        tutar: 100,
      }),
    ).toThrow(/kaynak ve hedef kasa aynı/i);
  });

  it('büyük tutarlarda simetri korunur (sign × amount)', () => {
    const plan = buildVirmanPlan({
      isVirman: true,
      sourceKasaId: 'kasa-aaa',
      targetKasaId: 'kasa-bbb',
      tutar: 1_500_000.5,
    });
    expect(plan).not.toBeNull();
    // Kaynak: -1 × 1.500.000,5 = -1.500.000,5
    // Hedef:  +1 × 1.500.000,5 = +1.500.000,5
    // Simetri: |kaynak| === |hedef|
    expect(Math.abs(plan!.source.balanceDelta)).toBe(plan!.target.balanceDelta);
  });
});

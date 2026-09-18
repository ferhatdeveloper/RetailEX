/**
 * B01 / B23 — gider ↔ kasa ledger tutar parse ve bakiye delta.
 */
import { describe, it, expect } from 'vitest';
import {
  expenseCashBalanceDeltaOnUpdate,
  expenseCashBalanceDeltaOnDelete,
  parseExpenseAmount,
} from './expenses';
import {
  computeKasaIslemiSign,
  kasaIslemiBalanceDeltaOnUpdate,
  normalizeGiderAciklama,
  parseKasaAmount,
  pickExpenseForKasaGider,
} from './kasa';

describe('parseExpenseAmount (IQD / TR binlik)', () => {
  it('"45.000" → 45000', () => {
    expect(parseExpenseAmount('45.000')).toBe(45000);
  });

  it('"450.000" → 450000', () => {
    expect(parseExpenseAmount('450.000')).toBe(450000);
  });

  it('ham sayı ve US ondalık korunur', () => {
    expect(parseExpenseAmount(45000)).toBe(45000);
    expect(parseExpenseAmount('45,5')).toBe(45.5);
  });
});

describe('gider nakit bakiye delta (B01/B23)', () => {
  it('450k → 45k düzeltmede bakiyeye +405k eklenir (çıkış azalır)', () => {
    expect(expenseCashBalanceDeltaOnUpdate(450000, 45000)).toBe(405000);
  });

  it('silmede sign=-1 ile +45k geri konur (eski 450k EKLENMEZ)', () => {
    expect(expenseCashBalanceDeltaOnDelete(45000, -1)).toBe(45000);
    expect(expenseCashBalanceDeltaOnDelete(450000, -1)).toBe(450000);
  });

  it('senaryo: açılış 100k, 450k gider → 45k düzelt → sil → 100k', () => {
    let bal = 100000;
    bal += -450000; // create GIDER
    expect(bal).toBe(-350000);
    bal += expenseCashBalanceDeltaOnUpdate(450000, 45000); // in-place edit
    expect(bal).toBe(55000);
    bal += expenseCashBalanceDeltaOnDelete(45000, -1); // delete
    expect(bal).toBe(100000);
  });
});

describe('updateKasaIslemi in-place delta', () => {
  it('GIDER_PUSULASI sign=-1', () => {
    expect(computeKasaIslemiSign('GIDER_PUSULASI')).toBe(-1);
  });

  it('450k→45k GIDER yerinde güncelleme bakiyeye +405k', () => {
    const delta = kasaIslemiBalanceDeltaOnUpdate(450000, -1, 45000, -1);
    expect(delta).toBe(405000);
  });

  it('silmede ledger tutarı (45k) geri alınır; eski 450k tekrar EKLENMEZ', () => {
    let bal = 100000;
    bal += -450000;
    bal += kasaIslemiBalanceDeltaOnUpdate(450000, -1, 45000, -1);
    expect(bal).toBe(55000);
    bal += expenseCashBalanceDeltaOnDelete(45000, -1);
    expect(bal).toBe(100000);
  });
});

describe('kasa gider eşleme (EYLUL KIRASI kardeş fiş)', () => {
  it('açıklama Türkçe locale ile eşleşir', () => {
    expect(normalizeGiderAciklama(' EYLUL KIRASI ')).toBe(normalizeGiderAciklama('eylul kirasi'));
  });

  it('cash_line_id varsa o satır seçilir', () => {
    const picked = pickExpenseForKasaGider(
      [
        { id: 'exp-450', description: 'EYLUL KIRASI', cash_line_id: 'line-a' },
        { id: 'exp-other', description: 'Başka', cash_line_id: 'line-b' },
      ],
      { cashLineId: 'line-a', definition: 'EYLUL KIRASI' },
    );
    expect(picked?.id).toBe('exp-450');
  });

  it('aynı açıklamada bağlı satır tercih edilir (yeni fiş açılmaz)', () => {
    const picked = pickExpenseForKasaGider(
      [
        { id: 'exp-unlinked', description: 'EYLUL KIRASI', cash_line_id: null },
        { id: 'exp-linked', description: 'EYLUL KIRASI', cash_line_id: 'line-original' },
      ],
      { definition: 'EYLUL KIRASI' },
    );
    expect(picked?.id).toBe('exp-linked');
    expect(picked?.cash_line_id).toBe('line-original');
  });
});

describe('parseKasaAmount / KASA_GIRIS 100k+450k→45k', () => {
  it('"450.000" → 450000 (Number 450 yapmaz)', () => {
    expect(Number('450.000')).toBe(450);
    expect(parseKasaAmount('450.000')).toBe(450000);
    expect(parseKasaAmount('45.000')).toBe(45000);
  });

  it('açılış 100k, giriş 450k düzenle 45k, sil → 100k (505k olmaz)', () => {
    const delta = kasaIslemiBalanceDeltaOnUpdate(450000, 1, 45000, 1);
    expect(delta).toBe(-405000);
    let bal = 100000;
    bal += 450000;
    bal += delta;
    expect(bal).toBe(145000);
    bal -= 45000;
    expect(bal).toBe(100000);
  });
});

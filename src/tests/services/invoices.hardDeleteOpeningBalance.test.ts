/**
 * Açılış/devir fişi (fiche_type='opening_balance') HARD DELETE — güvenlik kontrolleri.
 *
 * Amaç: `invoicesAPI.hardDeleteOpeningBalance` yalnız aşağıdaki koşulları
 * sağlayan satırları silebilmeli:
 *  1) Satır bulunabilmeli
 *  2) `fiche_type === 'opening_balance'`
 *  3) `is_cancelled !== true`
 *  4) Tutar birebir eşleşmeli (UI çift onayından sonra da)
 *  5) Döviz kodu eşleşmeli
 *
 * Bu test, hard-delete mantığının (gölge) implementasyonunu doğrular;
 * DB erişimi olmadan pure fonksiyonel kontrol yapar.
 */

import { describe, expect, it } from 'vitest';

/** invoicesAPI.hardDeleteOpeningBalance içindeki ön-kontrol bloğunun
 * gölge implementasyonu — DB çağrısı yerine `row` mock'u üzerinden. */
type OpeningBalanceRow = {
  id: string;
  fiche_type?: string | null;
  net_amount?: number | string | null;
  currency_code?: string | null;
  currency?: string | null;
  is_cancelled?: boolean | null;
};

function validateHardDeletePreconditions(
  row: OpeningBalanceRow | null,
  expectedAmount: number,
  expectedCurrency: string,
): { ok: boolean; deleted: 0 | 1; reason?: string } {
  if (!row) return { ok: false, deleted: 0, reason: 'Satır bulunamadı' };
  if (String(row.fiche_type || '').toLowerCase() !== 'opening_balance') {
    return {
      ok: false,
      deleted: 0,
      reason: `Yalnız opening_balance silinebilir (bu: ${row.fiche_type || '—'})`,
    };
  }
  if (row.is_cancelled === true) {
    return {
      ok: false,
      deleted: 0,
      reason: 'Bu fiş zaten iptal edilmiş (soft delete). HARD DELETE gerekmez.',
    };
  }
  const rowAmt = Math.abs(parseFloat(String(row.net_amount ?? 0)) || 0);
  const expAmt = Math.abs(Number(expectedAmount) || 0);
  if (rowAmt !== expAmt) {
    return {
      ok: false,
      deleted: 0,
      reason: `Tutar uyuşmuyor (satır: ${rowAmt}, onaylanan: ${expAmt})`,
    };
  }
  const rowCur = String(row.currency_code || row.currency || 'IQD').trim().toUpperCase();
  const expCur = String(expectedCurrency || '').trim().toUpperCase();
  if (rowCur !== expCur) {
    return {
      ok: false,
      deleted: 0,
      reason: `Döviz uyuşmuyor (satır: ${rowCur}, onaylanan: ${expCur})`,
    };
  }
  return { ok: true, deleted: 1 };
}

describe('invoicesAPI.hardDeleteOpeningBalance — ön-kontroller', () => {
  it('olmayan satır için Satır bulunamadı döner', () => {
    const r = validateHardDeletePreconditions(null, 1_650_000, 'IQD');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Satır bulunamadı');
  });

  it("fiche_type='opening_balance' olmayan satır reddedilir", () => {
    const r = validateHardDeletePreconditions(
      { id: 'x', fiche_type: 'sales_invoice', net_amount: 100, currency_code: 'IQD' },
      100,
      'IQD',
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('opening_balance');
  });

  it('zaten iptal edilmiş (is_cancelled=true) satır reddedilir', () => {
    const r = validateHardDeletePreconditions(
      { id: 'x', fiche_type: 'opening_balance', net_amount: 1_650_000, currency_code: 'IQD', is_cancelled: true },
      1_650_000,
      'IQD',
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('zaten iptal');
  });

  it('tutar uyuşmazsa reddedilir', () => {
    const r = validateHardDeletePreconditions(
      { id: 'x', fiche_type: 'opening_balance', net_amount: 1_650_000, currency_code: 'IQD' },
      1_320_000,
      'IQD',
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Tutar uyuşmuyor');
  });

  it('döviz uyuşmazsa reddedilir', () => {
    const r = validateHardDeletePreconditions(
      { id: 'x', fiche_type: 'opening_balance', net_amount: 1_650_000, currency_code: 'IQD' },
      1_650_000,
      'USD',
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Döviz uyuşmuyor');
  });

  it('devir fişi (1.650.000 IQD) silinebilir', () => {
    const r = validateHardDeletePreconditions(
      { id: 'x', fiche_type: 'opening_balance', net_amount: 1_650_000, currency_code: 'IQD' },
      1_650_000,
      'IQD',
    );
    expect(r.ok).toBe(true);
    expect(r.deleted).toBe(1);
  });

  it('net_amount string olarak gelirse de parse edilir', () => {
    const r = validateHardDeletePreconditions(
      { id: 'x', fiche_type: 'opening_balance', net_amount: '1320000.00', currency_code: 'IQD' },
      1_320_000,
      'IQD',
    );
    expect(r.ok).toBe(true);
  });

  it('negatif tutar (alacak yönlü devir) silinebilir', () => {
    const r = validateHardDeletePreconditions(
      { id: 'x', fiche_type: 'opening_balance', net_amount: -500_000, currency_code: 'IQD' },
      500_000,
      'IQD',
    );
    expect(r.ok).toBe(true);
  });
});

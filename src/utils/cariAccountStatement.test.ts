import { describe, expect, it } from 'vitest';
import { buildEkstreRows } from './cariAccountStatement';

describe('buildEkstreRows — müşteri', () => {
  it('veresiye satış + müşteri CH_TAHSILAT aynı tutarda: bakiye sıfır (2x bug yok)', () => {
    const rows = [
      { fiche_no: 'V-001', date: '2026-08-20', fiche_type: 'opening_balance', trcode: 99, net_amount: 0, total_amount: 0, is_cancelled: false },
      { fiche_no: 'S-001', date: '2026-08-29', fiche_type: 'sales_invoice', trcode: 8, net_amount: 85000, total_amount: 85000, payment_method: 'veresiye', is_cancelled: false },
      { fiche_no: 'T-001', date: '2026-08-29', fiche_type: 'CH_TAHSILAT', trcode: 0, amount: 85000, total_amount: 85000, is_cancelled: false },
    ];
    const out = buildEkstreRows(rows, 'customer');
    expect(out[0].balance).toBe(0);
    expect(out[1].balance).toBe(85000);
    expect(out[1].borcAmount).toBe(85000);
    expect(out[1].alacakAmount).toBe(0);
    expect(out[2].balance).toBe(0); // CH_TAHSILAT ile düştü
    expect(out[2].borcAmount).toBe(0);
    expect(out[2].alacakAmount).toBe(85000);
  });

  it('ABU STAR senaryosu: devir=0 + satış=170.000 → bakiye 170.000 (veresiye borç)', () => {
    const rows = [
      { fiche_no: 'ML-001-1787595915', date: '2026-08-20', fiche_type: 'opening_balance', trcode: 99, net_amount: 0, total_amount: 0, is_cancelled: false },
      { fiche_no: '20260829157592', date: '2026-08-29', fiche_type: 'sales_invoice', trcode: 8, net_amount: 170000, total_amount: 170000, payment_method: 'veresiye', is_cancelled: false },
    ];
    const out = buildEkstreRows(rows, 'customer');
    expect(out[0].balance).toBe(0);
    expect(out[0].borcAmount).toBe(0);
    expect(out[0].alacakAmount).toBe(0);
    expect(out[1].balance).toBe(170000);
    expect(out[1].borcAmount).toBe(170000);
  });

  it('müşteri CH_ODEME alacak sütununu artırır (müşteriye ödeme yaptık)', () => {
    const rows = [
      { fiche_no: 'O-001', date: '2026-08-29', fiche_type: 'CH_ODEME', trcode: 0, amount: 5000, total_amount: 5000, is_cancelled: false },
    ];
    const out = buildEkstreRows(rows, 'customer');
    expect(out[0].balance).toBe(5000);
    expect(out[0].borcAmount).toBe(5000);
    expect(out[0].alacakAmount).toBe(0);
  });
});

describe('buildEkstreRows — tedarikçi', () => {
  it('tedarikçi CH_ODEME borcu düşürür (alacak sütununa yazılır)', () => {
    const rows = [
      { fiche_no: 'P-001', date: '2026-08-29', fiche_type: 'purchase_invoice', trcode: 1, net_amount: 10000, total_amount: 10000, payment_method: 'Veresiye', is_cancelled: false },
      { fiche_no: 'O-001', date: '2026-08-29', fiche_type: 'CH_ODEME', trcode: 0, amount: 4000, total_amount: 4000, is_cancelled: false },
    ];
    const out = buildEkstreRows(rows, 'supplier');
    expect(out[0].balance).toBe(10000);
    expect(out[0].borcAmount).toBe(10000);
    expect(out[1].balance).toBe(6000);
    expect(out[1].borcAmount).toBe(0);
    expect(out[1].alacakAmount).toBe(4000);
  });
});

describe('buildEkstreRows — devir fişi', () => {
  it('devir borç (+): borcAmount sütununda', () => {
    const rows = [
      { fiche_no: 'DEV-001', date: '2026-01-01', fiche_type: 'opening_balance', trcode: 99, net_amount: 50000, total_amount: 50000, is_cancelled: false },
    ];
    const out = buildEkstreRows(rows, 'customer');
    expect(out[0].balance).toBe(50000);
    expect(out[0].borcAmount).toBe(50000);
    expect(out[0].alacakAmount).toBe(0);
  });

  it('devir alacak (−): alacakAmount sütununda, bakiye −', () => {
    const rows = [
      { fiche_no: 'DEV-001', date: '2026-01-01', fiche_type: 'opening_balance', trcode: 99, net_amount: -30000, total_amount: -30000, is_cancelled: false },
    ];
    const out = buildEkstreRows(rows, 'customer');
    expect(out[0].balance).toBe(-30000);
    expect(out[0].borcAmount).toBe(0);
    expect(out[0].alacakAmount).toBe(30000);
  });
});
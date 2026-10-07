/**
 * Tedarikçi (supplier) cari ekstresi yön simetrisi.
 *
 * Kök neden: buildEkstreRows supplier branch'inde "müşteriyle aynı mantık"
 * kullanılmıştı — alış faturası borç (B), iade alacak (A) yazılıyordu.
 * Bu YANLIŞ. Tedarikçi simetrisi:
 *   Alış faturası  → alacak (A) artar (biz tedarikçiye borçlanıyoruz)
 *   İade            → alacak (A) azalır / borç (B) artar
 *   CH_ODEME (ödeme) → bizim alacağımız azalır → borç (B) sütununa
 *   CH_TAHSILAT    → bizden para çekti → alacak (A) sütununa (nadir)
 *
 * Bu test, buildEkstreRows'un supplier için doğru yönde satır yazdığını
 * gölge veri üzerinden doğrular.
 */

import { describe, expect, it } from 'vitest';
import {
  buildEkstreRows,
  type EkstreRow,
} from '../../utils/cariAccountStatement';

function rowFromSales(item: Record<string, unknown>): EkstreRow {
  // buildEkstreRows total_amount alanını okuyor
  const withTotal = { ...item, total_amount: item.net_amount };
  return buildEkstreRows([withTotal], 'supplier')[0];
}

describe('buildEkstreRows — supplier yön simetrisi', () => {
  it('purchase_invoice → alacak (A) sütununa yazılır, borç (B) = 0', () => {
    const r = rowFromSales({
      fiche_type: 'purchase_invoice',
      payment_method: 'veresiye',
      net_amount: 1_000_000,
      is_cancelled: false,
      trcode: 1,
    });
    expect(r.alacakAmount).toBe(1_000_000);
    expect(r.borcAmount).toBe(0);
    expect(r.balance).toBe(1_000_000); // supplier + = A (biz borçluyuz)
  });

  it('return_invoice → borç (B) sütununa yazılır, alacak (A) = 0', () => {
    const r = rowFromSales({
      fiche_type: 'return_invoice',
      payment_method: 'veresiye',
      net_amount: 500_000,
      is_cancelled: false,
      trcode: 2,
    });
    expect(r.borcAmount).toBe(500_000);
    expect(r.alacakAmount).toBe(0);
    expect(r.balance).toBe(-500_000); // supplier − = B (alacağımız azalır)
  });

  it('CH_ODEME → borç (B) sütununa yazılır (peşin ödeme), alacak (A) = 0', () => {
    const r = rowFromSales({
      fiche_type: 'CH_ODEME',
      net_amount: 100_000,
      is_cancelled: false,
      trcode: 0,
    });
    expect(r.borcAmount).toBe(100_000);
    expect(r.alacakAmount).toBe(0);
    expect(r.balance).toBe(-100_000); // ödeme alacağı azaltır
  });

  it('CH_TAHSILAT → alacak (A) sütununa yazılır (nadir)', () => {
    const r = rowFromSales({
      fiche_type: 'CH_TAHSILAT',
      net_amount: 50_000,
      is_cancelled: false,
      trcode: 0,
    });
    expect(r.alacakAmount).toBe(50_000);
    expect(r.borcAmount).toBe(0);
    expect(r.balance).toBe(50_000);
  });

  it('Müşteri (customer) purchase_invoice olmamalı — yine de doğru yönde', () => {
    // Müşteri tarafında purchase_invoice gelirse bu bir edge case; balance düşmemeli
    const r = buildEkstreRows(
      [
        {
          fiche_type: 'sales_invoice',
          payment_method: 'veresiye',
          net_amount: 1_000_000,
          total_amount: 1_000_000,
          is_cancelled: false,
          trcode: 8,
        },
      ],
      'customer',
    )[0];
    expect(r.borcAmount).toBe(1_000_000); // müşteriye sattık → biz alacaklıyız (B)
    expect(r.alacakAmount).toBe(0);
  });

  it('MEGAL benzeri senaryo: 2 alış + 1 ödeme → sonuç 36.861.970 (A)', () => {
    const rows = buildEkstreRows(
      [
        { fiche_type: 'purchase_invoice', payment_method: 'Veresiye', net_amount: 100_000_000, total_amount: 100_000_000, is_cancelled: false, trcode: 1, fiche_no: 'IN1' },
        { fiche_type: 'purchase_invoice', payment_method: 'Veresiye', net_amount: 200_000_000, total_amount: 200_000_000, is_cancelled: false, trcode: 1, fiche_no: 'IN2' },
        { fiche_type: 'CH_ODEME', net_amount: 263_138_030, total_amount: 263_138_030, is_cancelled: false, trcode: 0, fiche_no: 'PAY1' },
      ],
      'supplier',
    );
    // 100M + 200M = 300M A; 263.138.030 B → net = 36.861.970 (A)
    const lastRow = rows[rows.length - 1];
    expect(lastRow.balance).toBe(36_861_970);
    const totalBorc = rows.reduce((s, r) => s + r.borcAmount, 0);
    const totalAlacak = rows.reduce((s, r) => s + r.alacakAmount, 0);
    expect(totalBorc).toBe(263_138_030);
    expect(totalAlacak).toBe(300_000_000);
  });
});

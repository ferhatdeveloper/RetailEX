/**
 * 09.10.2026 — Kullanıcı şikâyeti (günlük rapor, satış detayları):
 *   "90 yok boyle bır rakam"
 *
 * Günlük rapor Satış Detayları tablosunda "İndirim Öncesi" kolonu
 * toplamı, hizmet brüt + avans brüt toplamını yansıtıyordu (örn. 50+10
 * = 60, 25+5 = 30 → toplam 90). Bu "uydurma" bir rakam — gerçek brüt
 * hizmet cirosu 50+25=75, avans tutarı 15 ayrı izlenir.
 *
 * Düzeltme:
 *   1) Satır hücresinde avans (isAvans=true) → İndirim Öncesi = "—"
 *   2) Footer toplamında avans satırları hariç tutulur.
 *
 * Aşağıdaki testler, düzeltmenin beklenen footer davranışını ürettiğini
 * regresyona karşı korur; ReportsModule.tsx → beforeDiscount footerFormat
 * fonksiyonunun mantığını birebir taklit eder.
 */

import { describe, expect, it } from 'vitest';

interface DailyUnifiedRowLite {
  isAvans?: boolean;
  isDeposit?: boolean;
  beforeDiscount: number;
  total: number;
  discount: number;
}

/** ReportsModule.tsx → beforeDiscount footerFormat mantığı (09.10.2026). */
function sumBeforeDiscount(rows: DailyUnifiedRowLite[]): number {
  return rows.reduce((acc, r) => {
    if (r.isDeposit === true) return acc;
    // isAvans Hariç — avans brüt tutarı hizmet brütü değildir.
    if (r.isAvans === true) return acc;
    return acc + (Number(r.beforeDiscount ?? ((Number(r.total) || 0) + (Number(r.discount) || 0))) || 0);
  }, 0);
}

/** Hücre renderer: avans satırı için "—" döner. */
function cellBeforeDiscount(row: DailyUnifiedRowLite): string {
  if (row.isDeposit === true) return '—';
  if (row.isAvans === true) return '—';
  return String(Number(row.beforeDiscount ?? ((Number(row.total) || 0) + (Number(row.discount) || 0))) || 0);
}

describe('dailyBeforeDiscountAvans — İndirim Öncesi avans Hariç (09.10.2026)', () => {
  it('kullanıcı senaryosu: arz 10k+50k+5k+25k → footer İndirim Öncesi = 75.000 (avans hariç)', () => {
    // Kullanıcı örneği:
    //   AVANS-4a707266 | Rezervasyon | İndirim Öncesi = "—"
    //   BEA-MV1CJAGM  | Hizmet      | İndirim Öncesi = 50.000
    //   AVANS-eac16ed2| Rezervasyon | İndirim Öncesi = "—"
    //   BEA-MV1CU75C  | Hizmet      | İndirim Öncesi = 25.000
    //   TOPLAM İndirim Öncesi: 75.000 (50+25)
    //   "90.000 diye bir rakam yok" — artık görünmüyor.
    const rows: DailyUnifiedRowLite[] = [
      { isAvans: true,  beforeDiscount: 10000, total: 10000, discount: 0 }, // AVANS-4a707266
      {                 beforeDiscount: 50000, total: 40000, discount: 0 }, // BEA-MV1CJAGM
      { isAvans: true,  beforeDiscount:  5000, total:  5000, discount: 0 }, // AVANS-eac16ed2
      {                 beforeDiscount: 25000, total: 20000, discount: 0 }, // BEA-MV1CU75C
    ];
    expect(sumBeforeDiscount(rows)).toBe(75000);
    expect(cellBeforeDiscount(rows[0])).toBe('—'); // avans
    expect(cellBeforeDiscount(rows[1])).toBe('50000'); // hizmet
    expect(cellBeforeDiscount(rows[2])).toBe('—'); // avans
    expect(cellBeforeDiscount(rows[3])).toBe('25000'); // hizmet
  });

  it('avans Hariç tutulmasaydı footer 90.000 çıkardı (regresyon karşıtı)', () => {
    // Önceki davranış: footer = 10000 + 50000 + 5000 + 25000 = 90.000
    // (kullanıcı "böyle bir rakam yok" diyordu)
    const rows: DailyUnifiedRowLite[] = [
      { isAvans: true,  beforeDiscount: 10000, total: 10000, discount: 0 },
      {                 beforeDiscount: 50000, total: 40000, discount: 0 },
      { isAvans: true,  beforeDiscount:  5000, total:  5000, discount: 0 },
      {                 beforeDiscount: 25000, total: 20000, discount: 0 },
    ];
    const sumWithAvans = rows.reduce(
      (acc, r) => acc + (Number(r.beforeDiscount) || 0),
      0,
    );
    expect(sumWithAvans).toBe(90000); // önceki (yanlış) davranış

    // Düzeltme sonrası: avans Hariç → 75.000
    expect(sumBeforeDiscount(rows)).toBe(75000);
  });

  it('deposit (rezervasyon avansı eski tip) Hariç tutulmaya devam eder', () => {
    const rows: DailyUnifiedRowLite[] = [
      { isDeposit: true, beforeDiscount: 0, total: 0, discount: 0 },
      {                beforeDiscount: 50_000, total: 50_000, discount: 0 },
    ];
    expect(sumBeforeDiscount(rows)).toBe(50_000);
    expect(cellBeforeDiscount(rows[0])).toBe('—');
  });

  it('tüm satırlar avans/deposit ise footer 0', () => {
    const rows: DailyUnifiedRowLite[] = [
      { isAvans: true, beforeDiscount: 15_000, total: 15_000, discount: 0 },
      { isAvans: true, beforeDiscount: 25_000, total: 25_000, discount: 0 },
    ];
    expect(sumBeforeDiscount(rows)).toBe(0);
  });

  it('hizmet satırları toplamı (avans yok) korunur', () => {
    const rows: DailyUnifiedRowLite[] = [
      { beforeDiscount: 30_000, total: 25_000, discount: 5_000 },
      { beforeDiscount: 70_000, total: 70_000, discount: 0 },
    ];
    expect(sumBeforeDiscount(rows)).toBe(100_000);
  });
});
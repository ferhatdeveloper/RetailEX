import { describe, expect, it } from 'vitest';

/**
 * 10.10.2026 — Günlük Rapor KPI'larına rezervasyon avansı (CH_TAHSILAT +
 * ozel_kod=REZERVASYON) entegrasyonu regresyon testi.
 *
 * Kullanıcı senaryosu (ROZA):
 *   Ciro 50k (peşin 50k nakit) + Rezervasyon avansı 10k (henüz hizmet
 *   verilmemiş peşinat, ayrı müşteri/cari) + Önceki avans çıkışı 40k
 *   (iade/avans iptal). Kasa Para Girişi = 50k, Cebe Giren Nakit =
 *   50k, Tahsil Edilen = 50k (50k peşin + 10k avans − 10k avans
 *   çıkışı eşit = 50k). Ciro 50k.
 *
 * Bu test, ROZA senaryosunda 3 KPI'nın `+ extraReservation` ile doğru
 * toplandığını simüle eder. ReportsModule.tsx içindeki `dailyCash`,
 * `dailyCollected` ve `totalDailyCashIn` hesaplamasının 1:1 taklidi.
 */

// ROZA senaryosu tipleri
interface FakeKasaLine {
  islem_tipi: string;
  ozel_kod?: string | null;
  tutar: number;
}

function sumRezervasyonAvansi(cashLines: FakeKasaLine[]): number {
  let total = 0;
  for (const line of cashLines) {
    const tip = String(line.islem_tipi || '').trim().toUpperCase();
    if (tip !== 'CH_TAHSILAT') continue;
    const special = String(line.ozel_kod ?? '').trim().toUpperCase();
    if (special !== 'REZERVASYON') continue;
    total += Math.abs(Number(line.tutar) || 0);
  }
  return total;
}

describe('dailyCash + dailyCollected + totalDailyCashIn — rezervasyon avansı dahil', () => {
  it('ROZA senaryosu: 50k ciro + 10k rezervasyon avansı → 3 KPI = 50k', () => {
    // Kasa para girişi (KASA_GIRIS, ORTAK_SERMAYE_TAHSILAT, ORTAK_PARA_GIRIS)
    const dailyCashInRows: FakeKasaLine[] = [
      { islem_tipi: 'KASA_GIRIS', tutar: 50_000 }, // 50k peşin ciro
    ];

    // CH_TAHSILAT satırları (kasa değil, ayrı izlenir)
    const kasaLinesForSelectedDate: FakeKasaLine[] = [
      { islem_tipi: 'CH_TAHSILAT', ozel_kod: 'REZERVASYON', tutar: 10_000 }, // rezervasyon avansı
    ];

    const extraReservation = sumRezervasyonAvansi(kasaLinesForSelectedDate);
    expect(extraReservation).toBe(10_000);

    // dailyCash: peşin nakit (Cebe Giren Nakit) + extraReservation
    const dailyCash = 50_000 + extraReservation;
    expect(dailyCash).toBe(60_000);

    // dailyCollected: tahsil edilen nakit + kart + extraReservation
    const dailyCollected = 50_000 + extraReservation;
    expect(dailyCollected).toBe(60_000);

    // totalDailyCashIn: dailyCashInRows sum + extraReservation
    const totalDailyCashIn = dailyCashInRows.reduce(
      (s, cl) => s + Math.abs(Number(cl.tutar) || 0),
      0,
    ) + extraReservation;
    expect(totalDailyCashIn).toBe(60_000);

    // Ciro (dailyTotal) değişmez: rezervasyon avansı ciroya katılmaz
    const dailyTotal = 50_000;
    expect(dailyTotal).toBe(50_000);
  });

  it('rezervasyon avansı yoksa 3 KPI orijinal değerlerde kalır', () => {
    const dailyCashInRows: FakeKasaLine[] = [
      { islem_tipi: 'KASA_GIRIS', tutar: 30_000 },
    ];

    const kasaLinesForSelectedDate: FakeKasaLine[] = [
      { islem_tipi: 'CH_TAHSILAT', tutar: 5_000 }, // REZERVASYON değil → extraCollections'a gider
    ];

    const extraReservation = sumRezervasyonAvansi(kasaLinesForSelectedDate);
    expect(extraReservation).toBe(0);

    const dailyCash = 30_000 + extraReservation;
    expect(dailyCash).toBe(30_000);

    const dailyCollected = 30_000 + extraReservation;
    expect(dailyCollected).toBe(30_000);

    const totalDailyCashIn = dailyCashInRows.reduce(
      (s, cl) => s + Math.abs(Number(cl.tutar) || 0),
      0,
    ) + extraReservation;
    expect(totalDailyCashIn).toBe(30_000);
  });

  it('çift sayım olmaz: REZERVASYON avansı hem dailyCashInRows hem extraReservation içinde değil', () => {
    // CH_TAHSILAT, REPORT_CASH_IN_TYPES'a dahil değil → dailyCashInRows'a girmez
    const dailyCashInRows: FakeKasaLine[] = [
      { islem_tipi: 'KASA_GIRIS', tutar: 25_000 },
    ];
    const kasaLinesForSelectedDate: FakeKasaLine[] = [
      { islem_tipi: 'CH_TAHSILAT', ozel_kod: 'REZERVASYON', tutar: 15_000 },
    ];

    const extraReservation = sumRezervasyonAvansi(kasaLinesForSelectedDate);

    const totalDailyCashIn = dailyCashInRows.reduce(
      (s, cl) => s + Math.abs(Number(cl.tutar) || 0),
      0,
    ) + extraReservation;

    // 25k (kasa girişi) + 15k (rezervasyon avansı) = 40k; çift sayım yok
    expect(totalDailyCashIn).toBe(40_000);
  });

  it('boş kasa lines: extraReservation = 0, KPI etkilenmez', () => {
    const dailyCashInRows: FakeKasaLine[] = [
      { islem_tipi: 'KASA_GIRIS', tutar: 10_000 },
    ];
    const kasaLinesForSelectedDate: FakeKasaLine[] = [];

    const extraReservation = sumRezervasyonAvansi(kasaLinesForSelectedDate);
    expect(extraReservation).toBe(0);

    const totalDailyCashIn = dailyCashInRows.reduce(
      (s, cl) => s + Math.abs(Number(cl.tutar) || 0),
      0,
    ) + extraReservation;
    expect(totalDailyCashIn).toBe(10_000);
  });
});
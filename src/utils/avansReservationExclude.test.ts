/**
 * 16.10.2026 — Rezervasyon tamamlandıysa avans "Rezervasyon Tutarı" kolonundan
 * hariç tutulmalı. cari_avans.status='open' olsa bile, bağlı randevu
 * status='completed' ise Ciro'ya yansımış sayılır ve bilgi kolonunu kirletmemeli
 * (kullanıcı talebi 16.10.2026 guzel DB).
 *
 * Regresyon koruması — PeriodSummaryReport.tsx → buildAvansDepositsMap.
 */

import { describe, expect, it } from 'vitest';
import {
  buildAvansDepositsMap,
  type AvansDepositRow,
} from './avansReservationExclude';

const COMPLETED_APT = 'b687d081-343f-41d4-bb6c-c0971500e7ef';
const OPEN_APT = '99999999-9999-9999-9999-999999999999';
const completedIds = new Set<string>([COMPLETED_APT]);

describe('avansReservationExclude — tamamlanmış randevu avansı hariç (16.10.2026)', () => {
  it('kullanıcı senaryosu: 16.10.2026 10.000 IQD avans + tamamlanmış randevu → depositAmount=0', () => {
    const rows: AvansDepositRow[] = [
      {
        amount: 10_000,
        created_at: '2026-10-16T18:43:54.130714+03:00',
        notes: `Rezervasyon Tutarı · Randevu No ${COMPLETED_APT}`,
      },
    ];
    const map = buildAvansDepositsMap(rows, completedIds, 'monthly-days');
    // Tamamlanmış randevuya bağlı avans Hariç → boş map
    expect(map.size).toBe(0);
  });

  it('henüz tamamlanmamış randevu avansı depositAmount\'a eklenir', () => {
    const rows: AvansDepositRow[] = [
      {
        amount: 10_000,
        created_at: '2026-10-16T18:43:54.130714+03:00',
        notes: `Rezervasyon Tutarı · Randevu No ${OPEN_APT}`,
      },
    ];
    const map = buildAvansDepositsMap(rows, completedIds, 'monthly-days');
    const bucket = map.get('2026-10-16');
    expect(bucket).toEqual({ count: 1, amount: 10_000 });
  });

  it('notsuz avans (randevuya bağlı değil) depositAmount\'a eklenir', () => {
    const rows: AvansDepositRow[] = [
      { amount: 5_000, created_at: '2026-10-16T10:00:00+03:00', notes: null },
    ];
    const map = buildAvansDepositsMap(rows, completedIds, 'monthly-days');
    const bucket = map.get('2026-10-16');
    expect(bucket).toEqual({ count: 1, amount: 5_000 });
  });

  it('karma: tamamlanmış + açık + notsuz avans aynı gün', () => {
    const rows: AvansDepositRow[] = [
      // Tamamlanmış randevuya bağlı (Hariç)
      { amount: 10_000, created_at: '2026-10-16T08:00:00+03:00', notes: `Randevu No ${COMPLETED_APT}` },
      // Açık randevuya bağlı (dahil)
      { amount: 15_000, created_at: '2026-10-16T09:00:00+03:00', notes: `Randevu No ${OPEN_APT}` },
      // Notsuz (dahil)
      { amount: 5_000, created_at: '2026-10-16T10:00:00+03:00', notes: null },
    ];
    const map = buildAvansDepositsMap(rows, completedIds, 'monthly-days');
    const bucket = map.get('2026-10-16');
    // Hariç tutulan 10.000 + dahil edilen 15.000 + 5.000 = 20.000
    expect(bucket).toEqual({ count: 2, amount: 20_000 });
  });

  it('yıllık mod: aynı ay içinde birden fazla gün toplanır', () => {
    const rows: AvansDepositRow[] = [
      { amount: 5_000, created_at: '2026-10-05T10:00:00+03:00', notes: null },
      { amount: 7_000, created_at: '2026-10-12T11:00:00+03:00', notes: `Randevu No ${OPEN_APT}` },
    ];
    const map = buildAvansDepositsMap(rows, completedIds, 'yearly-months');
    const bucket = map.get('2026-10');
    expect(bucket).toEqual({ count: 2, amount: 12_000 });
  });

  it('regresyon: tamamlama kontrolü devre dışı bırakılırsa eski davranış (10.000 dahil)', () => {
    const rows: AvansDepositRow[] = [
      { amount: 10_000, created_at: '2026-10-16T18:43:54+03:00', notes: `Randevu No ${COMPLETED_APT}` },
    ];
    // Boş set → hiçbir randevu tamamlanmamış sayılır → avans dahil edilir
    const map = buildAvansDepositsMap(rows, new Set(), 'monthly-days');
    const bucket = map.get('2026-10-16');
    expect(bucket).toEqual({ count: 1, amount: 10_000 });
  });

  it('sıfır/negatif tutar atlanır', () => {
    const rows: AvansDepositRow[] = [
      { amount: 0, created_at: '2026-10-16T10:00:00+03:00', notes: null },
      { amount: -1_000, created_at: '2026-10-16T11:00:00+03:00', notes: null },
      { amount: 3_000, created_at: '2026-10-16T12:00:00+03:00', notes: null },
    ];
    const map = buildAvansDepositsMap(rows, completedIds, 'monthly-days');
    const bucket = map.get('2026-10-16');
    expect(bucket).toEqual({ count: 1, amount: 3_000 });
  });
});

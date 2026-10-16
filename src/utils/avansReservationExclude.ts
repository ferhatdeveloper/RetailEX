/**
 * 16.10.2026 — Rezervasyon tamamlandıysa avans "Rezervasyon Tutarı" kolonundan
 * hariç tutulmalı. cari_avans.status='open' olsa bile, bağlı randevu
 * status='completed' ise Ciro'ya yansımış sayılır ve bilgi kolonunu kirletmemeli
 * (kullanıcı talebi 16.10.2026 guzel DB).
 *
 * PeriodSummaryReport avansDepositsMap döngüsünde kullanılır; test
 * src/utils/avansReservationExclude.test.ts içinde.
 */

export interface AvansDepositRow {
  amount: number | string;
  created_at: string;
  notes?: string | null;
}

export interface DayBucket {
  count: number;
  amount: number;
}

/**
 * avansDepositsRaw → avansDepositsMap dönüşümü. Tamamlanmış randevuya bağlı
 * avanslar Hariç tutulur (Ciro'ya yansımış kabul edilir).
 *
 * @param rows cari_avans satırları (status='open', tarih aralığında)
 * @param completedAppointmentIds beauty_appointments.status='completed' id'leri
 * @param mode 'monthly-days' (YYYY-MM-DD) | 'yearly-months' (YYYY-MM)
 */
export function buildAvansDepositsMap(
  rows: AvansDepositRow[] | null | undefined,
  completedAppointmentIds: Set<string>,
  mode: 'monthly-days' | 'yearly-months',
): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  if (!Array.isArray(rows) || rows.length === 0) return map;
  for (const row of rows) {
    const created = String(row.created_at || '').trim();
    if (!created) continue;
    const dayKey = created.slice(0, 10); // YYYY-MM-DD
    const key = mode === 'monthly-days' ? dayKey : dayKey.slice(0, 7); // YYYY-MM
    const amt = Math.max(0, Number(row.amount) || 0);
    if (!(amt > 0)) continue;
    // Tamamlanmış randevuya bağlı avans Ciro'ya yansımış → "Rezervasyon
    // Tutarı" kolonundan Hariç (kullanıcı talebi 16.10.2026).
    const notes = String(row.notes ?? '');
    const aptMatch = notes.match(/Randevu No ([0-9a-f-]{36})/i);
    if (aptMatch && completedAppointmentIds.has(aptMatch[1])) {
      continue;
    }
    const cur = map.get(key) || { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += amt;
    map.set(key, cur);
  }
  return map;
}

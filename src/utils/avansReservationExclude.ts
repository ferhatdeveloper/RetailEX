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
  status?: string | null;
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
    // Tamamlanmış veya uygulanmış avans net kalana girmez. Alınan tutar
    // buildClosedReservationInfoMap ile bilgi kolonunda kalır.
    const status = String(row.status || '').trim().toLowerCase();
    if (status === 'applied') continue;
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

const APPOINTMENT_NOTE = /Randevu No ([0-9a-f-]{36})/i;

/**
 * Kapanmış rezervasyonun alınan tutarı. Ciro ve net kalana yazılmaz;
 * yalnızca bilgi kolonu (Rezervasyon Tutarı) içindir.
 * Randevu üzerindeki depozito zaten sayıldıysa aynı avans tekrar eklenmez.
 */
export function buildClosedReservationInfoMap(
  rows: AvansDepositRow[] | null | undefined,
  closedAppointmentIds: Set<string>,
  mode: 'monthly-days' | 'yearly-months',
  alreadyCountedAppointmentIds: Set<string> = new Set(),
): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  if (!Array.isArray(rows) || rows.length === 0) return map;
  for (const row of rows) {
    const created = String(row.created_at || '').trim();
    if (!created) continue;
    const amt = Math.max(0, Number(row.amount) || 0);
    if (!(amt > 0)) continue;
    const status = String(row.status || '').trim().toLowerCase();
    const notes = String(row.notes ?? '');
    const aptMatch = notes.match(APPOINTMENT_NOTE);
    const appointmentId = aptMatch ? aptMatch[1] : '';
    const linkedClosed = Boolean(appointmentId) && closedAppointmentIds.has(appointmentId);
    if (status !== 'applied' && !linkedClosed) continue;
    if (appointmentId && alreadyCountedAppointmentIds.has(appointmentId)) continue;
    const dayKey = created.slice(0, 10);
    const key = mode === 'monthly-days' ? dayKey : dayKey.slice(0, 7);
    const cur = map.get(key) || { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += amt;
    map.set(key, cur);
  }
  return map;
}

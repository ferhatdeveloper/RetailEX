/**
 * 14.10.2026 — Rezervasyon (henüz faturası kesilmemiş randevu) hesaplama.
 * Aylık Gün Özeti, Günlük Rapor, POS Z Raporu, Beauty Raporu gibi tüm
 * ciro raporlarında ortak kullanılır.
 *
 * Mantık (kullanıcı kararı 14.10.2026 17:03):
 *   - status='completed' → hizmet verildi; Ciro'ya girer; buraya yansımaz.
 *   - status='cancelled' → iptal; Ciro'ya girmez; buraya yansımaz.
 *   - status='scheduled' (veya diğer) → hizmet verilmemiş; hizmet
 *     brütü henüz Ciro'ya girmez (fatura kesilmedi); tahsil edilen
 *     peşinat Ciro dışı tahsilat olarak ayrı kolondadır ve Net Kalan'a
 *     eklenir.
 *
 *   - **bucket.deposit** = tahsil edilen peşinat (deposit_amount) →
 *     "Rezervasyon Tutarı" kolonu + Net Kalan'a eklenir.
 *   - **bucket.gross** = hizmet brüt fiyatı (henüz Ciro'ya yansımamış,
 *     sadece bilgi amaçlı "Rezervasyon Brüt" kolonu).
 *   - **bucket.pending** = brüt − peşinat = hizmet verildiğinde
 *     tahsil edilecek kalan (sadece bilgi amaçlı "Rezervasyon Kalan"
 *     kolonu; Ciro'ya yansımaz).
 *
 * Brüt seçimi (fallback zinciri):
 *   1) total_price > 0 → brüt = total_price
 *   2) total_price = 0 / küçükse → service_price (katalogdan)
 *   3) o da yoksa → deposit_amount
 *
 * @param appointments beautyService.getAppointmentsInRange çıktısı
 * @param mode 'monthly-days' (YYYY-MM-DD) veya 'yearly-months' (YYYY-MM)
 * @returns Map<periodKey, { gross, pending, deposit, count }>
 */
export type ReservationBucket = { gross: number; pending: number; deposit: number; count: number };

/**
 * Tek randevu için brüt/peşinat/pending hesapla. Hem map hem range
 * hem day helper'ları aynı formülü kullanır (tek kaynak).
 */
export function calcReservationForAppointment(
    a: {
        total_price?: number | string | null;
        deposit_amount?: number | string | null;
        service_price?: number | string | null;
    },
): { gross: number; pending: number; deposit: number; relevant: boolean } {
    const dep = Math.max(0, Number(a.deposit_amount) || 0);
    const tp = Math.max(0, Number(a.total_price) || 0);
    const sp = Math.max(0, Number(a.service_price) || 0);
    // Brüt seç:
    //  - service_price varsa ve total_price'tan büyükse → katalog brüt
    //    (toplam > yazılı: indirim sonrası yazılmış eski veri düzeltmesi)
    //  - total_price > 0 ise ve service_price yoksa → total_price
    //  - total_price = 0 ve service_price varsa → service_price
    //  - o da yoksa → deposit_amount
    let gross = 0;
    if (sp > 0 && (tp <= 0 || sp > tp)) {
        gross = sp;
    } else if (tp > 0) {
        gross = tp;
    } else if (dep > 0) {
        gross = dep;
    }
    if (gross <= 0 && dep <= 0) {
        return { gross: 0, pending: 0, deposit: 0, relevant: false };
    }
    return {
        gross,
        pending: Math.max(0, gross - dep),
        deposit: dep,
        relevant: true,
    };
}

export function buildReservationMap(
    appointments: Array<{
        appointment_date?: string;
        status?: string;
        total_price?: number | string | null;
        deposit_amount?: number | string | null;
        service_price?: number | string | null;
    }> | null | undefined,
    mode: 'monthly-days' | 'yearly-months',
): Map<string, ReservationBucket> {
    const map = new Map<string, ReservationBucket>();
    if (!Array.isArray(appointments) || appointments.length === 0) return map;
    for (const a of appointments) {
        const st = String(a.status ?? '').trim().toLowerCase();
        if (st === 'completed' || st === 'cancelled' || st === 'canceled') continue;
        const d = String(a.appointment_date ?? '').slice(0, 10);
        if (!d) continue;
        const key = mode === 'monthly-days' ? d : d.slice(0, 7);
        const r = calcReservationForAppointment(a);
        if (!r.relevant) continue;
        const cur = map.get(key) || { gross: 0, pending: 0, deposit: 0, count: 0 };
        cur.gross += r.gross;
        cur.pending += r.pending;
        cur.deposit += r.deposit;
        cur.count += 1;
        map.set(key, cur);
    }
    return map;
}

function isClosedAppointmentStatus(status: unknown): boolean {
  const st = String(status ?? '').trim().toLowerCase();
  return st === 'completed' || st === 'cancelled' || st === 'canceled';
}

/**
 * Kapanmış randevuda duran depozito. Brüt ve kalan eklenmez; hizmet tutarı
 * kapanınca cirodadır. Alınan rezervasyon tutarı bilgi kolonunda kalır.
 */
export function buildClosedAppointmentDepositMap(
  appointments: Array<{
    id?: string | null;
    appointment_date?: string;
    status?: string;
    deposit_amount?: number | string | null;
  }> | null | undefined,
  mode: 'monthly-days' | 'yearly-months',
): { map: Map<string, { deposit: number; count: number }>; appointmentIds: Set<string> } {
  const map = new Map<string, { deposit: number; count: number }>();
  const appointmentIds = new Set<string>();
  if (!Array.isArray(appointments)) return { map, appointmentIds };
  for (const a of appointments) {
    if (!isClosedAppointmentStatus(a.status)) continue;
    const dep = Math.max(0, Number(a.deposit_amount) || 0);
    if (!(dep > 0)) continue;
    const id = String(a.id || '').trim();
    if (id) appointmentIds.add(id);
    const d = String(a.appointment_date ?? '').slice(0, 10);
    if (!d) continue;
    const key = mode === 'monthly-days' ? d : d.slice(0, 7);
    const cur = map.get(key) || { deposit: 0, count: 0 };
    cur.deposit += dep;
    cur.count += 1;
    map.set(key, cur);
  }
  return { map, appointmentIds };
}

/**
 * Tek gün için rezervasyon toplamı. Günlük Rapor / POS Z Raporu gibi
 * tek tarihli raporlarda kullanılır.
 */
export function reservationPendingForDay(
    appointments: Array<{
        appointment_date?: string;
        status?: string;
        total_price?: number | string | null;
        deposit_amount?: number | string | null;
        service_price?: number | string | null;
    }> | null | undefined,
    dayKey: string, // YYYY-MM-DD
): ReservationBucket {
    const empty: ReservationBucket = { gross: 0, pending: 0, deposit: 0, count: 0 };
    if (!Array.isArray(appointments) || !dayKey) return empty;
    let out: ReservationBucket = empty;
    for (const a of appointments) {
        const st = String(a.status ?? '').trim().toLowerCase();
        if (st === 'completed' || st === 'cancelled' || st === 'canceled') continue;
        const d = String(a.appointment_date ?? '').slice(0, 10);
        if (d !== dayKey) continue;
        const r = calcReservationForAppointment(a);
        if (!r.relevant) continue;
        out = {
            gross: out.gross + r.gross,
            pending: out.pending + r.pending,
            deposit: out.deposit + r.deposit,
            count: out.count + 1,
        };
    }
    return out;
}

/**
 * Tarih aralığı için rezervasyon toplamı. Günlük Rapor / POS Z Raporu
 * aralık modunda (from..to) kullanılır.
 */
export function reservationPendingForRange(
    appointments: Array<{
        appointment_date?: string;
        status?: string;
        total_price?: number | string | null;
        deposit_amount?: number | string | null;
        service_price?: number | string | null;
    }> | null | undefined,
    fromIso: string, // YYYY-MM-DD
    toIso: string,   // YYYY-MM-DD
): ReservationBucket {
    const empty: ReservationBucket = { gross: 0, pending: 0, deposit: 0, count: 0 };
    if (!Array.isArray(appointments) || !fromIso || !toIso) return empty;
    let out: ReservationBucket = empty;
    for (const a of appointments) {
        const st = String(a.status ?? '').trim().toLowerCase();
        if (st === 'completed' || st === 'cancelled' || st === 'canceled') continue;
        const d = String(a.appointment_date ?? '').slice(0, 10);
        if (!d || d < fromIso || d > toIso) continue;
        const r = calcReservationForAppointment(a);
        if (!r.relevant) continue;
        out = {
            gross: out.gross + r.gross,
            pending: out.pending + r.pending,
            deposit: out.deposit + r.deposit,
            count: out.count + 1,
        };
    }
    return out;
}

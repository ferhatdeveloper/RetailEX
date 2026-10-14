/**
 * 14.10.2026 — Rezervasyon (henüz faturası kesilmemiş randevu) brüt/kalan
 * hesaplama. Aylık Gün Özeti, Günlük Rapor, POS Z Raporu, Beauty Raporu
 * gibi tüm ciro raporlarında ortak kullanılır.
 *
 * Mantık:
 *   - status='completed' → hizmet verildi; Ciro'ya girer; buraya yansımaz.
 *   - status='cancelled' → iptal; Ciro'ya girmez; buraya yansımaz.
 *   - status='scheduled' (veya diğer) → hizmet verilmemiş, brüt=kalan
 *     fatura kesilecek. Ciro'ya girmez, buraya girer.
 *   - brüt = total_price; kalan = max(0, brüt − deposit_amount)
 *   - **Fallback**: total_price 0 ise ve deposit_amount > 0 ise brüt =
 *     deposit_amount kabul edilir (AppointmentPOS'ta indirim sonrası
 *     total 0 yazılabiliyor; peşinat bilinen tek tutar). Bu durumda
 *     pending = 0 (gerçek brüt belli değil; sadece tahsilat görünür).
 *
 * @param appointments beautyService.getAppointmentsInRange çıktısı
 * @param mode 'monthly-days' (YYYY-MM-DD) veya 'yearly-months' (YYYY-MM)
 * @returns Map<periodKey, { gross, pending, count }>
 */
export type ReservationBucket = { gross: number; pending: number; count: number };

/**
 * Tek randevu için brüt/peşinat/pending hesapla. Hem map hem range
 * hem day helper'ları aynı formülü kullanır (tek kaynak).
 */
export function calcReservationForAppointment(
    a: {
        total_price?: number | string | null;
        deposit_amount?: number | string | null;
    },
): { gross: number; pending: number; relevant: boolean } {
    const tp = Math.max(0, Number(a.total_price) || 0);
    const dep = Math.max(0, Number(a.deposit_amount) || 0);
    if (tp > 0) {
        return { gross: tp, pending: Math.max(0, tp - dep), relevant: true };
    }
    if (dep > 0) {
        // total_price 0 / yazılmamış (örn. AppointmentPOS indirim sonrası
        // 0 yazdı, veya eski kayıt) → brüt = peşinat kabul et; gerçek
        // brüt belli olmadığı için pending = 0.
        return { gross: dep, pending: 0, relevant: true };
    }
    return { gross: 0, pending: 0, relevant: false };
}

export function buildReservationMap(
    appointments: Array<{
        appointment_date?: string;
        status?: string;
        total_price?: number | string | null;
        deposit_amount?: number | string | null;
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
        const cur = map.get(key) || { gross: 0, pending: 0, count: 0 };
        cur.gross += r.gross;
        cur.pending += r.pending;
        cur.count += 1;
        map.set(key, cur);
    }
    return map;
}

/**
 * Tek gün için rezervasyon kalan toplamı. Günlük Rapor / POS Z Raporu
 * gibi tek tarihli raporlarda kullanılır.
 */
export function reservationPendingForDay(
    appointments: Array<{
        appointment_date?: string;
        status?: string;
        total_price?: number | string | null;
        deposit_amount?: number | string | null;
    }> | null | undefined,
    dayKey: string, // YYYY-MM-DD
): ReservationBucket {
    const empty: ReservationBucket = { gross: 0, pending: 0, count: 0 };
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
    }> | null | undefined,
    fromIso: string, // YYYY-MM-DD
    toIso: string,   // YYYY-MM-DD
): ReservationBucket {
    const empty: ReservationBucket = { gross: 0, pending: 0, count: 0 };
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
            count: out.count + 1,
        };
    }
    return out;
}

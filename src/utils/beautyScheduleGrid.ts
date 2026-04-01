import type { BeautyAppointment } from '../types/beauty';

export interface BeautySpanPlacement {
    apt: BeautyAppointment;
    startIdx: number;
    span: number;
}

/**
 * Randevuları slot satırlarına yayar: her satırda en fazla bir randevu (çakışanlar atlanır).
 */
export function buildBeautySpanPlacements(
    apts: BeautyAppointment[],
    slots: string[],
    intervalMin: number,
    slotBucket: (raw: string, interval: number) => string
): BeautySpanPlacement[] {
    const N = slots.length;
    const parseStart = (a: BeautyAppointment): number | null => {
        const raw = String(a.appointment_time ?? a.time ?? '').trim();
        const m = raw.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return null;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
        return hh * 60 + mm;
    };

    const sorted = [...apts].sort((a, b) => (parseStart(a) ?? 0) - (parseStart(b) ?? 0));
    const owner: (string | null)[] = Array(N).fill(null);
    const out: BeautySpanPlacement[] = [];

    for (const apt of sorted) {
        const bucket = slotBucket(String(apt.appointment_time ?? apt.time ?? ''), intervalMin);
        const startIdx = slots.indexOf(bucket);
        if (startIdx < 0) continue;
        const dur = Math.max(1, Number(apt.duration ?? 30));
        const span = Math.min(Math.max(1, Math.ceil(dur / intervalMin)), N - startIdx);
        let conflict = false;
        for (let k = startIdx; k < startIdx + span; k++) {
            if (owner[k]) {
                conflict = true;
                break;
            }
        }
        if (conflict) continue;
        for (let k = startIdx; k < startIdx + span; k++) owner[k] = apt.id;
        out.push({ apt, startIdx, span });
    }
    return out;
}

export function isBeautySpanContinuation(i: number, placements: BeautySpanPlacement[]): boolean {
    return placements.some(p => i > p.startIdx && i < p.startIdx + p.span);
}

/**
 * Randevu INSERT çakışması.
 *
 * `beauty_appointments` birincil anahtarı `id`. Aynı istemci kimliği ikinci kez
 * POST edilirse (yeniden deneme / çift gönderim, ilk INSERT commit olduktan
 * sonra) Postgres 23505 ve `*_pkey` döner. Bu, fiş numarası çakışması değildir.
 * Aynı kimlik başarıdır: ikinci satır açılmaz. Fiş / randevu numarası UNIQUE
 * ihlali burada yutulmaz.
 */

export type AppointmentUniqueTarget = 'primary_key' | 'fiche_or_number' | 'other';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FICHE_RE = /fiche_no|appointment_no|appointment_number|randevu_no/i;

/** Geçerli UUID gelirse onu kullan (aynı kayıt yeniden denensin). Yoksa yeni üret. */
export function resolveBeautyAppointmentId(existing: unknown, generate: () => string): string {
    const s = String(existing ?? '').trim();
    if (UUID_RE.test(s)) return s;
    return generate();
}

export function errorTextForConflict(e: unknown): string {
    if (e == null) return '';
    if (typeof e === 'string') return e;
    if (e instanceof Error && e.message) return e.message;
    if (typeof e === 'object') {
        const o = e as Record<string, unknown>;
        return [o.message, o.code, o.pgCode, o.detail, o.details, o.hint]
            .filter((v) => typeof v === 'string' && v.trim().length > 0)
            .map((v) => String(v).trim())
            .join(' ');
    }
    return String(e);
}

/**
 * 23505 metnini kısıta göre ayır.
 * Fiş / numara önce bakılır; `Key (id)` ve `*_pkey` birincil anahtardır.
 */
export function classifyUniqueConflict(detail: string): AppointmentUniqueTarget | null {
    const text = String(detail ?? '');
    if (!/23505|unique constraint|duplicate key/i.test(text)) return null;

    const constraint = /unique constraint\s+"([^"]+)"/i.exec(text)?.[1] ?? '';
    const keyCols = /Key\s*\(([^)]+)\)\s*=/i.exec(text)?.[1] ?? '';
    if (FICHE_RE.test(constraint) || FICHE_RE.test(keyCols)) return 'fiche_or_number';

    const cols = keyCols
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
    const idOnly = cols.length > 0 && cols.every((c) => c === 'id');
    if (/_pkey$/i.test(constraint) || idOnly) return 'primary_key';
    return 'other';
}

/** Aynı randevu kimliği (pkey). Fiş UNIQUE değil. */
export function isAppointmentPrimaryKeyConflict(e: unknown): boolean {
    return classifyUniqueConflict(errorTextForConflict(e)) === 'primary_key';
}

export function bookingUniqueReasonMessageKey(
    target: AppointmentUniqueTarget | null,
): 'bBookingModalApiReasonUniquePkey' | 'bBookingModalApiReasonUniqueFiche' | 'bBookingModalApiReasonUnique' {
    if (target === 'primary_key') return 'bBookingModalApiReasonUniquePkey';
    if (target === 'fiche_or_number') return 'bBookingModalApiReasonUniqueFiche';
    return 'bBookingModalApiReasonUnique';
}

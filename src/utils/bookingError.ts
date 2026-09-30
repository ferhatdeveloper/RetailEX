/**
 * Beauty randevu kayıt hata ayrıştırıcı (pure utility).
 *
 * `AppointmentPOS.tsx` içindeki `parseBookingApiError` ve failedStep mantığı
 * burada toplandı; böylece birim testlerle kolayca doğrulanabilir.
 *
 * PostgREST / pg_bridge paketi: `{ code: '23505', message: '...', detail: '...' }`.
 * Native `Error` veya düz string de gelebilir.
 */

export type BookingApiReasonKey =
    | 'migration_required'
    | 'unique_violation'
    | 'null_constraint'
    | 'fk_violation'
    | 'connection'
    | 'unknown';

export type BookingFailedStep =
    | 'payment'
    | 'sale'
    | 'appointment'
    | 'unknown';

export interface ParsedBookingError {
    reasonKey: BookingApiReasonKey;
    detail: string;
    pgCode: string | null;
    hint: string | null;
    failedStep: BookingFailedStep;
}

/** Hata objesi farklı formatta gelse bile teknik detayı (string) üretir. */
export function extractTechnicalError(e: unknown): string {
    if (!e) return '';
    if (typeof e === 'string') return e;
    if (typeof e === 'number' || typeof e === 'boolean') return String(e);
    if (e instanceof Error && e.message?.trim()) return e.message;

    if (typeof e === 'object') {
        const anyErr = e as Record<string, unknown>;
        const parts = [
            anyErr.message,
            anyErr.code,
            anyErr.detail,
            anyErr.hint,
            anyErr.context,
        ]
            .filter(v => typeof v === 'string' && v.trim().length > 0)
            .map(v => String(v).trim());
        if (parts.length) return parts.join(' | ');
        try {
            return JSON.stringify(anyErr);
        } catch {
            return String(anyErr);
        }
    }
    return '';
}

/** Postgres / pg_bridge hatasını kullanıcı dostu şekilde özetler. */
export function parseBookingApiError(e: unknown): ParsedBookingError {
    const detail = extractTechnicalError(e);
    const lower = detail.toLowerCase();
    const rawCode =
        (typeof e === 'object' && e !== null && (e as any).code) ||
        (typeof e === 'object' && e !== null && (e as any).pgCode) ||
        null;
    const pgCode = typeof rawCode === 'string' ? rawCode : null;

    let reasonKey: BookingApiReasonKey = 'unknown';
    if (
        pgCode === '42P01' ||
        pgCode === '42703' ||
        lower.includes('does not exist') ||
        (lower.includes('relation ') && lower.includes('does not exist')) ||
        (lower.includes('column ') && lower.includes('does not exist'))
    ) {
        reasonKey = 'migration_required';
    } else if (
        pgCode === '23505' ||
        lower.includes('unique constraint') ||
        lower.includes('duplicate key')
    ) {
        reasonKey = 'unique_violation';
    } else if (
        pgCode === '23502' ||
        lower.includes('not-null constraint') ||
        lower.includes('null value in column')
    ) {
        reasonKey = 'null_constraint';
    } else if (
        pgCode === '23503' ||
        lower.includes('foreign key') ||
        lower.includes('violates foreign key')
    ) {
        reasonKey = 'fk_violation';
    } else if (
        lower.includes('fetch failed') ||
        lower.includes('failed to fetch') ||
        lower.includes('networkerror') ||
        lower.includes('timeout') ||
        lower.includes('econnrefused') ||
        (lower.includes('bridge') && (lower.includes('not') || lower.includes('unreach')))
    ) {
        reasonKey = 'connection';
    }

    const failedStep = detectFailedStep(detail);

    return {
        reasonKey,
        detail,
        pgCode,
        hint: null,
        failedStep,
    };
}

/** Hangi adımın başarısız olduğunu (mümkünse) hata mesajından çıkarır. */
export function detectFailedStep(detail: string): BookingFailedStep {
    const lower = (detail || '').toLowerCase();
    if (
        lower.includes('beauty_appointment_payments') ||
        lower.includes('appointment_payments') ||
        lower.includes('deposit_sale') ||
        lower.includes('deposit_amount')
    ) {
        return 'payment';
    }
    if (
        lower.includes('sale_items') ||
        lower.includes('_sales') ||
        lower.includes('fiche_no')
    ) {
        return 'sale';
    }
    if (
        lower.includes('beauty_appointments') ||
        lower.includes('clinical_data') ||
        lower.includes('appointment_date') ||
        lower.includes('appointment_time')
    ) {
        return 'appointment';
    }
    return 'unknown';
}

/** PostgREST veya pg_bridge hatasından Postgres SQLSTATE kodu çıkarır. */
export function extractPgCode(e: unknown): string | null {
    if (typeof e !== 'object' || e === null) return null;
    const anyErr = e as Record<string, unknown>;
    for (const key of ['code', 'pgCode', 'sqlState']) {
        const v = anyErr[key];
        if (typeof v === 'string' && /^[0-9A-Z]{5}$/.test(v.trim())) {
            return v.trim();
        }
    }
    return null;
}
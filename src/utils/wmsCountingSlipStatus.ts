import type { CountingSlip } from '../services/wmsStockCount';

const ALLOWED = new Set<string>([
    'draft',
    'active',
    'counting',
    'reconciliation',
    'completed',
    'cancelled',
]);

/** API / eski kayıtlardan gelen varyantları tek koda indirger. */
const ALIASES: Record<string, CountingSlip['status']> = {
    complete: 'completed',
    done: 'completed',
    closed: 'completed',
    canceled: 'cancelled',
    reconciling: 'reconciliation',
    in_progress: 'counting',
    open: 'active',
};

/**
 * Sayım fişi durumunu UI ve filtreler için kanonik değere çevirir.
 * Bilinmeyen değerlerde `draft` döner (liste filtreleri kırılmasın).
 */
export function normCountingSlipStatus(raw: string | undefined | null): CountingSlip['status'] {
    const s = String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_');
    if (!s) return 'draft';
    if (ALLOWED.has(s)) return s as CountingSlip['status'];
    const mapped = ALIASES[s];
    if (mapped) return mapped;
    return 'draft';
}

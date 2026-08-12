/**
 * `beauty_portal_settings.allow_staff_slot_overlap` — PG / köprü / JSON farkları için güvenli okuma.
 * Örn. `!!"false"` true olurdu; açıkça false kabul edilir.
 */
export function normalizeAllowStaffSlotOverlap(ps: unknown): boolean {
    if (ps == null || typeof ps !== 'object') return false;
    const o = ps as Record<string, unknown>;
    const v = o.allow_staff_slot_overlap ?? o.allowStaffSlotOverlap;
    if (v === true) return true;
    if (v === false || v == null) return false;
    if (typeof v === 'number') return v !== 0;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === 't' || s === '1' || s === 'yes' || s === 'on';
}

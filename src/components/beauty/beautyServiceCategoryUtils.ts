import type { BeautyService } from '../../types/beauty';

/** Ana kategori anahtarı: parent doluysa parent, değilse leaf (category). */
export function beautyServiceMainKey(s: Pick<BeautyService, 'parent_category' | 'category'>): string {
    const p = String(s.parent_category ?? '').trim();
    if (p.length > 0) return p;
    return String(s.category ?? '').trim() || 'uncategorized';
}

/** Alt kategori (leaf) — her zaman `category`. */
export function beautyServiceSubKey(s: Pick<BeautyService, 'category'>): string {
    return String(s.category ?? '').trim() || 'uncategorized';
}

export function beautyServiceActive(s: Pick<BeautyService, 'is_active'>): boolean {
    return s.is_active !== false;
}

/**
 * Select/API `value` — yalnızca kod/slug. Görünen ad (`name`) buraya yazılmaz.
 * Türkçe: `toLocaleLowerCase('tr-TR')` (İ→i, I→ı); görünür label ayrı tutulur.
 */
export function beautyCategorySlug(name: string): string {
    const base = String(name || '')
        .trim()
        .toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    return base || `cat_${Date.now().toString(36)}`;
}

/** Master satırının select value/id’si: kod varsa kod, yoksa ad. */
export function beautyCategoryStoredValue(cat: { code?: string | null; name?: string | null }): string {
    return String(cat.code ?? '').trim() || String(cat.name ?? '').trim();
}

export function beautyCategoryIsTopLevel(cat: { parent_id?: string | null }): boolean {
    return !String(cat.parent_id ?? '').trim();
}

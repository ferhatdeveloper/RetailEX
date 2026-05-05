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

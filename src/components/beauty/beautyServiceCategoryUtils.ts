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
 * Arapça ve birleşik işaretler bu kodda kalmaz; etiket `name` alanındadır.
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

export type BeautyCategoryNameSource = {
    code?: string | null;
    name?: string | null;
};

/** Karşılaştırma anahtarı. Etiket bu katlanmış metin değildir. */
function foldBeautyCategoryKey(value: string): string {
    return value.toLocaleLowerCase('tr-TR');
}

/**
 * Kategori listesi ve kart alt satırı.
 * Ad doluysa kullanıcının yazdığı metin (Arapça, Türkçe, İngilizce).
 * Ad yoksa kod. Ad uydurulmaz.
 */
export function beautyCategoryRowLabel(row: BeautyCategoryNameSource): string {
    const name = String(row.name ?? '').trim();
    if (name) return name;
    return String(row.code ?? '').trim();
}

/**
 * Yeni kategori kaydı. `code` anahtar/slug olabilir; `name` ve `label` yazılan metindir.
 * Arapça Latin harfe çevrilmez, birleşik işaretler atılmaz.
 */
export function createBeautyCategoryRecord(rawName: string): {
    code: string;
    name: string;
    label: string;
} {
    const name = String(rawName ?? '').trim();
    const code = beautyCategorySlug(name);
    return {
        code,
        name,
        label: beautyCategoryRowLabel({ code, name }),
    };
}

function findBeautyCategoryMaster(
    key: string,
    masters: ReadonlyArray<BeautyCategoryNameSource>,
): BeautyCategoryNameSource | undefined {
    const folded = foldBeautyCategoryKey(key);
    const rows = masters.map((row) => ({
        row,
        code: String(row.code ?? '').trim(),
        name: String(row.name ?? '').trim(),
    }));
    return (
        rows.find((entry) => entry.code === key)
        ?? rows.find((entry) => entry.name === key)
        ?? rows.find((entry) => entry.code.length > 0 && foldBeautyCategoryKey(entry.code) === folded)
    )?.row;
}

/**
 * Hizmet satırındaki kategori anahtarını görünen ada çevirir.
 * Master satırda ad varsa o ad; yalnızca kod varsa kod.
 * Master yoksa hazır çeviri (ör. beauty → Güzellik), o da yoksa anahtarın kendisi.
 */
export function resolveBeautyCategoryLabel(
    storedKey: string,
    masters?: ReadonlyArray<BeautyCategoryNameSource> | null,
    fallbackLabels?: Readonly<Record<string, string>> | null,
): string {
    const key = String(storedKey ?? '').trim();
    if (!key) return '';
    if (masters && masters.length > 0) {
        const master = findBeautyCategoryMaster(key, masters);
        if (master) {
            const name = String(master.name ?? '').trim();
            if (name) return name;
            const code = String(master.code ?? '').trim();
            if (code) return code;
        }
    }
    if (fallbackLabels) {
        const direct = fallbackLabels[key];
        if (direct && String(direct).trim()) return String(direct).trim();
        const folded = foldBeautyCategoryKey(key);
        for (const [labelKey, labelValue] of Object.entries(fallbackLabels)) {
            if (foldBeautyCategoryKey(labelKey) === folded && String(labelValue).trim()) {
                return String(labelValue).trim();
            }
        }
    }
    return key;
}

/** Kart alt satırındaki kategori yolu. Süre ve tutar eklenmez. */
export function beautyServiceCategoryPathLabel(
    service: { category?: string | null; parent_category?: string | null },
    masters?: ReadonlyArray<BeautyCategoryNameSource> | null,
    fallbackLabels?: Readonly<Record<string, string>> | null,
): string {
    const parent = String(service.parent_category ?? '').trim();
    const leaf = String(service.category ?? '').trim();
    const leafLabel = resolveBeautyCategoryLabel(leaf, masters, fallbackLabels);
    if (!parent) return leafLabel;
    const parentLabel = resolveBeautyCategoryLabel(parent, masters, fallbackLabels);
    return `${parentLabel} › ${leafLabel}`;
}

/** Master satırının select value/id’si: kod varsa kod, yoksa ad. */
export function beautyCategoryStoredValue(cat: { code?: string | null; name?: string | null }): string {
    return String(cat.code ?? '').trim() || String(cat.name ?? '').trim();
}

export function beautyCategoryIsTopLevel(cat: { parent_id?: string | null }): boolean {
    return !String(cat.parent_id ?? '').trim();
}

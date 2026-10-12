import type { ReactNode } from 'react';

/**
 * UUID formatı: 8-4-4-4-12 hex (case-insensitive, kısa çizgili).
 *
 * `customers` tablosunda karşılığı olmayan `customer_id`'ler raporların
 * `customer_name` alanına düşebiliyor (eski demo verisi, silinen müşteri,
 * LEFT JOIN ile gelen null yerine ham UUID). Bu yardımcı, UUID görünümlü
 * müşteri adlarını operatöre anlamlı biçimde göstermek için kullanılır.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLACEHOLDER_CLASS = 'text-slate-400 italic';
const MISSING_CLASS = 'text-slate-400';

/**
 * Müşteri hücresi render fonksiyonu.
 *
 * Davranış:
 *  - Boş / null / undefined → "—"
 *  - UUID formatında ise → "Silinmiş müşteri" (italic, tooltip orijinal UUID)
 *  - Aksi hâlde → gerçek ad
 *
 * @param name Hücrede gösterilecek müşteri adı (veya ham customer_id)
 * @returns Render edilmiş JSX
 */
export function renderCustomerCell(name: string | null | undefined): ReactNode {
    if (name == null) {
        return <span className={MISSING_CLASS}>—</span>;
    }
    const trimmed = String(name).trim();
    if (trimmed === '') {
        return <span className={MISSING_CLASS}>—</span>;
    }
    if (UUID_RE.test(trimmed)) {
        return (
            <span className={PLACEHOLDER_CLASS} title={trimmed}>
                Silinmiş müşteri
            </span>
        );
    }
    return <span>{trimmed}</span>;
}

/**
 * Salt metin versiyonu — print/HTML export gibi JSX kullanılamayan yerler için.
 *
 * UUID ise "Silinmiş müşteri", aksi hâlde adın kendisi; boş ise "—".
 */
export function customerNameText(name: string | null | undefined): string {
    if (name == null) return '—';
    const trimmed = String(name).trim();
    if (trimmed === '') return '—';
    if (UUID_RE.test(trimmed)) return 'Silinmiş müşteri';
    return trimmed;
}

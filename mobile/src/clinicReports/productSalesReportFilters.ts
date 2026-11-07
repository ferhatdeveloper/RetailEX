/**
 * Ürün Bazlı Satış Raporu — malzeme/hizmet filtre SQL yardımcıları.
 *
 * "Ürün bazlı" rapor **yalnızca malzeme satırlarını** gösterir; hizmet, paket,
 * promosyon ve indirim satırları Hariç tutulur. Güzellik (beauty) veritabanında
 * HAIR CUT gibi hizmet satırları `sale_items.item_type = 'Hizmet'` ile gelir
 * ve bu rapora dahil edilmemelidir.
 */

/** Malzeme sayılmayan satır türleri (lowercase, trim). */
export const PRODUCT_SALES_EXCLUDED_LINE_TYPES = [
  'hizmet',
  'service',
  'paket',
  'package',
  'promosyon',
  'indirim',
] as const;

/** SQL parçası — `sale_items.item_type` malzeme filtresi.
 *  `WHERE` içinde doğrudan kullanılır. Boş/NULL değerler "Malzeme" kabul edilir. */
export const SQL_PRODUCT_SALES_MATERIAL_ONLY = `COALESCE(LOWER(TRIM(si.item_type)), 'malzeme') NOT IN (${PRODUCT_SALES_EXCLUDED_LINE_TYPES.map((t) => `'${t}'`).join(', ')})`;

/** Türkçe `İ`/`I` dönüşümü: JS `.toLowerCase()` Türkçe büyük İ'yi doğru
 *  küçültmez. SQL tarafında `LOWER()` Postgres ile aynı sonucu üretir; biz de
 *  `toLocaleLowerCase('tr-TR')` ile eşliyoruz. */
function trLower(value: string): string {
  return value.toLocaleLowerCase('tr-TR');
}

/** JS tarafında verilen `item_type` değerinin ürün bazlı rapora dahil edilip
 *  edilmediğini söyle. NULL/boş → malzeme kabul edilir (DB default). */
export function isProductSalesMaterialLineType(itemType: string | null | undefined): boolean {
  const t = trLower(String(itemType ?? '').trim());
  if (!t) return true; // DB default 'Malzeme'
  return !PRODUCT_SALES_EXCLUDED_LINE_TYPES.includes(t as (typeof PRODUCT_SALES_EXCLUDED_LINE_TYPES)[number]);
}
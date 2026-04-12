/**
 * RetailEx ExcelModule (`src/components/modules/ExcelModule.tsx`) — Ürünler şablonu ile
 * aynı sayfa adı, sütun sırası ve başlık metinleri. Üretim scriptleri burayı import etmeli.
 */
export const PRODUCT_EXCEL_SHEET_NAME = 'Ürünler';

/** `TEMPLATES.products.sample[0]` ile aynı anahtarlar ve sıra */
export const PRODUCT_EXCEL_COLUMNS = [
  'Ürün Kodu*',
  'Ürün Adı*',
  'Barkod',
  'Kategori',
  'Grup Kodu',
  'Marka',
  'Birim',
  'Alış Fiyatı',
  'Satış Fiyatı*',
  'KDV Oranı (%)',
  'Min Stok',
  'Max Stok',
  'Özel Kod 1',
  'Özel Kod 2',
  'Özel Kod 3',
  'Açıklama',
  'Görsel URL',
  'Aktif (E/H)',
];

/** ExcelModule `downloadExcel` ile aynı sütun genişliği kuralı */
export function productSheetColWidths() {
  const maxWidth = 30;
  return PRODUCT_EXCEL_COLUMNS.map((k) => ({
    wch: Math.min(Math.max(k.length + 2, 12), maxWidth),
  }));
}

export function orderedProductRow(valuesByCol) {
  return Object.fromEntries(PRODUCT_EXCEL_COLUMNS.map((k) => [k, valuesByCol[k] ?? '']));
}

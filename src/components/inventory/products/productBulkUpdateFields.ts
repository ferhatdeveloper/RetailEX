export type BulkUpdateFieldKind = 'text' | 'number' | 'currency' | 'percent' | 'bool' | 'date';

export interface BulkUpdateFieldDef {
  /** Product API camelCase alan adı */
  id: string;
  labelKey: string;
  kind: BulkUpdateFieldKind;
  purchaseOnly?: boolean;
}

/** Seçili ürünlerde toplu güncellenebilir DB alanları */
export const PRODUCT_BULK_UPDATE_FIELDS: BulkUpdateFieldDef[] = [
  { id: 'category', labelKey: 'category', kind: 'text' },
  { id: 'groupCode', labelKey: 'groupCode', kind: 'text' },
  { id: 'subGroupCode', labelKey: 'subGroupCode', kind: 'text' },
  { id: 'brand', labelKey: 'brand', kind: 'text' },
  { id: 'model', labelKey: 'model', kind: 'text' },
  { id: 'manufacturer', labelKey: 'manufacturer', kind: 'text' },
  { id: 'supplier', labelKey: 'supplier', kind: 'text' },
  { id: 'origin', labelKey: 'origin', kind: 'text' },
  { id: 'materialType', labelKey: 'productGridColMaterialType', kind: 'text' },
  { id: 'unit', labelKey: 'unit', kind: 'text' },
  { id: 'taxRate', labelKey: 'productGridColTax', kind: 'percent' },
  { id: 'price', labelKey: 'unitPrice', kind: 'currency' },
  { id: 'cost', labelKey: 'cost', kind: 'currency', purchaseOnly: true },
  { id: 'salePriceUSD', labelKey: 'productGridColPriceUsd', kind: 'currency' },
  { id: 'purchasePriceUSD', labelKey: 'productGridColPurchaseUsd', kind: 'currency', purchaseOnly: true },
  { id: 'salePriceEUR', labelKey: 'productGridColPriceEur', kind: 'currency' },
  { id: 'purchasePriceEUR', labelKey: 'productGridColPurchaseEur', kind: 'currency', purchaseOnly: true },
  { id: 'currency', labelKey: 'currency', kind: 'text' },
  { id: 'customExchangeRate', labelKey: 'customExchangeRate', kind: 'number' },
  { id: 'minStock', labelKey: 'minStock', kind: 'number' },
  { id: 'maxStock', labelKey: 'maxStock', kind: 'number' },
  { id: 'criticalStock', labelKey: 'criticalStock', kind: 'number' },
  { id: 'specialCode1', labelKey: 'specialCode', kind: 'text' },
  { id: 'specialCode2', labelKey: 'specialCode', kind: 'text' },
  { id: 'specialCode3', labelKey: 'specialCode', kind: 'text' },
  { id: 'specialCode4', labelKey: 'specialCode', kind: 'text' },
  { id: 'specialCode5', labelKey: 'specialCode', kind: 'text' },
  { id: 'specialCode6', labelKey: 'specialCode', kind: 'text' },
  { id: 'priceList1', labelKey: 'priceList', kind: 'currency' },
  { id: 'priceList2', labelKey: 'priceList', kind: 'currency' },
  { id: 'priceList3', labelKey: 'priceList', kind: 'currency' },
  { id: 'priceList4', labelKey: 'priceList', kind: 'currency' },
  { id: 'priceList5', labelKey: 'priceList', kind: 'currency' },
  { id: 'priceList6', labelKey: 'priceList', kind: 'currency' },
  { id: 'isActive', labelKey: 'active', kind: 'bool' },
  { id: 'isScaleProduct', labelKey: 'scaleProduct', kind: 'bool' },
  { id: 'hasVariants', labelKey: 'productGridColHasVariants', kind: 'bool' },
  { id: 'followUpReminderDays', labelKey: 'productGridColFollowUpDays', kind: 'number' },
  { id: 'expiryTracking', labelKey: 'expiryTracking', kind: 'bool' },
  { id: 'expiryDate', labelKey: 'itemExpiryDate', kind: 'date' },
  { id: 'shelfLifeDays', labelKey: 'shelfLife', kind: 'number' },
  { id: 'description_tr', labelKey: 'productGridColDescTr', kind: 'text' },
  { id: 'description_en', labelKey: 'productGridColDescEn', kind: 'text' },
  { id: 'description_ar', labelKey: 'productGridColDescAr', kind: 'text' },
  { id: 'description_ku', labelKey: 'productGridColDescKu', kind: 'text' },
];

export function parseBulkUpdateRawValue(
  kind: BulkUpdateFieldKind,
  raw: string
): string | number | boolean | null | undefined {
  const trimmed = raw.trim();
  if (kind === 'bool') {
    if (trimmed === '1' || trimmed.toLocaleLowerCase('tr-TR') === 'true' || trimmed.toLocaleLowerCase('tr-TR') === 'evet') {
      return true;
    }
    if (trimmed === '0' || trimmed.toLocaleLowerCase('tr-TR') === 'false' || trimmed.toLocaleLowerCase('tr-TR') === 'hayır') {
      return false;
    }
    return undefined;
  }
  if (kind === 'date') {
    return trimmed === '' ? null : trimmed;
  }
  if (kind === 'number' || kind === 'currency' || kind === 'percent') {
    if (trimmed === '') return kind === 'number' ? null : 0;
    const n = Number(trimmed.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return trimmed;
}

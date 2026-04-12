import type { Product } from '../core/types/models';
import type { ReceiptLangCode, ReceiptSettings } from '../services/receiptSettingsService';

/** Fiş ürün adı için seçilebilir `Product` alanları (DB kolonlarıyla uyumlu) */
export const RECEIPT_PRODUCT_NAME_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'name', label: 'name (ana ad)' },
  { value: 'name_tr', label: 'name_tr' },
  { value: 'name_en', label: 'name_en' },
  { value: 'name_ar', label: 'name_ar' },
  { value: 'name_ku', label: 'name_ku' },
  { value: 'code', label: 'code' },
  { value: 'sku', label: 'sku' },
  { value: 'description', label: 'description' },
  { value: 'description_tr', label: 'description_tr' },
  { value: 'description_en', label: 'description_en' },
  { value: 'description_ar', label: 'description_ar' },
  { value: 'description_ku', label: 'description_ku' },
];

const ALLOWED_FIELDS = new Set(RECEIPT_PRODUCT_NAME_FIELD_OPTIONS.map((o) => o.value));

function readProductField(product: Partial<Product> | null | undefined, fieldKey: string): string | undefined {
  if (!product || !fieldKey || !ALLOWED_FIELDS.has(fieldKey)) return undefined;
  const v = (product as Record<string, unknown>)[fieldKey];
  if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

/**
 * Fiş satırında gösterilecek ürün adı — ayarlardaki dile göre alan seçer, yoksa `name`e düşer.
 */
export function resolveProductNameForReceipt(
  product: Partial<Product> | null | undefined,
  lang: ReceiptLangCode,
  settings: ReceiptSettings | null | undefined
): string {
  const map = settings?.productNameFieldByLang || {};
  const key = map[lang]?.trim() || 'name';
  const fromField = readProductField(product, key);
  if (fromField) return fromField;
  const fallback = readProductField(product, 'name');
  if (fallback) return fallback;
  return '';
}

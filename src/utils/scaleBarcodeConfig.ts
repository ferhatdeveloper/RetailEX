/**
 * Rongta etiket terazisi barkod tipi (PLU alanı 0–99).
 * Tip 99: özel/özelleştirilmiş barkod — RLS1000’de genelde tip 17 ile aynı yapı:
 *   EAN-13 prefix 27 + PLU(5) + gram(5) + kontrol hanesi
 */
export const RONGTA_BARCODE_TYPE_DEFAULT = 99;

const STORAGE_KEY = 'retailex_scale_barcode_type';

/** POS / terazi köprüsü için barkod tipi (localStorage ile mağaza bazlı). */
export function getScaleBarcodeType(): number {
  if (typeof localStorage === 'undefined') return RONGTA_BARCODE_TYPE_DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === '') return RONGTA_BARCODE_TYPE_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 99) return n;
  } catch {
    /* ignore */
  }
  return RONGTA_BARCODE_TYPE_DEFAULT;
}

export function setScaleBarcodeType(type: number): void {
  if (typeof localStorage === 'undefined') return;
  const n = Math.max(0, Math.min(99, Math.trunc(type)));
  localStorage.setItem(STORAGE_KEY, String(n));
}

/** PLU gönderiminde kullanılacak barkod tipi (ürün alanı yoksa varsayılan). */
export function resolvePluBarcodeType(productType?: number | null): number {
  if (productType != null && Number.isFinite(productType) && productType >= 0 && productType <= 99) {
    return Math.trunc(productType);
  }
  return getScaleBarcodeType();
}

/** 14 hane barkod (10000000091610) sonek anlamı. */
export type Code10SuffixMode = 'weight_grams' | 'total_iqd';

const CODE10_SUFFIX_STORAGE_KEY = 'retailex_code10_suffix_mode';
const CODE10_SUFFIX_DEFAULT: Code10SuffixMode = 'weight_grams';

/** 10 hane kod + sonek: weight_grams = gram; total_iqd = satır tutarı (IQD). */
export function getCode10SuffixMode(): Code10SuffixMode {
  if (typeof localStorage === 'undefined') return CODE10_SUFFIX_DEFAULT;
  try {
    const raw = localStorage.getItem(CODE10_SUFFIX_STORAGE_KEY);
    if (raw === 'total_iqd' || raw === 'weight_grams') return raw;
  } catch {
    /* ignore */
  }
  return CODE10_SUFFIX_DEFAULT;
}

export function setCode10SuffixMode(mode: Code10SuffixMode): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CODE10_SUFFIX_STORAGE_KEY, mode);
}

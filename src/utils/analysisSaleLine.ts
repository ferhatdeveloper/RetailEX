import type { Product } from '../core/types/models';
import { isInvoiceServiceLineType } from './invoiceLineType';

function beautyServiceMainKey(s: { parent_category?: string; category?: string }): string {
  const p = String(s.parent_category ?? '').trim();
  if (p.length > 0) return p;
  return String(s.category ?? '').trim() || 'uncategorized';
}

export type AnalysisSaleLineKind = 'service' | 'product';

export interface AnalysisSaleLineInput {
  productId?: string;
  productName?: string;
  lineType?: string;
  item_type?: string;
}

/** Kategori kartı (id / code → görünen ad) — category_id veya category_code UUID/kod çözümü */
export type AnalysisCategoryLookupRow = { id?: string; code?: string; name?: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveCategoryLabel(
  raw: string,
  lookup?: AnalysisCategoryLookupRow[],
): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (lookup?.length) {
    const lower = v.toLowerCase();
    const hit = lookup.find((c) => {
      const id = String(c.id ?? '').trim().toLowerCase();
      const code = String(c.code ?? '').trim().toLowerCase();
      const name = String(c.name ?? '').trim().toLowerCase();
      return (id && id === lower) || (code && code === lower) || (name && name === lower);
    });
    const n = String(hit?.name ?? '').trim();
    if (n) return n;
  }
  // Eşleşmeyen UUID'yi kategori adı sanma — boş bırak, sonraki fallback'e düş
  if (UUID_RE.test(v)) return '';
  return v;
}

export interface AnalysisSplitAmount {
  service: number;
  product: number;
}

const BEAUTY_CAT_I18N: Record<string, string> = {
  laser: 'bCatLaser',
  hair_salon: 'bCatHairSalon',
  beauty: 'bCatBeauty',
  botox: 'bCatBotox',
  filler: 'bCatFiller',
  massage: 'bCatMassage',
  skincare: 'bCatSkincare',
  makeup: 'bCatMakeup',
  nails: 'bCatNails',
  spa: 'bCatSpa',
  other: 'bCatOther',
  uncategorized: 'bCatOther',
};

function lineTypeRaw(item: AnalysisSaleLineInput): string {
  return String(item.lineType ?? item.item_type ?? '').trim();
}

function productIdKey(item: AnalysisSaleLineInput): string {
  return String(item.productId ?? '').trim();
}

type CatalogProductPick = Pick<
  Product,
  'id' | 'code' | 'name' | 'isService' | 'materialType' | 'category' | 'categoryCode' | 'categoryId'
>;

function findCatalogProduct(
  products: Array<CatalogProductPick>,
  productId: string,
): CatalogProductPick | undefined {
  const key = productId.trim();
  if (!key) return undefined;
  const lower = key.toLowerCase();
  return products.find(
    (p) =>
      String(p.id ?? '').trim() === key ||
      String(p.id ?? '').trim().toLowerCase() === lower ||
      String(p.code ?? '').trim().toLowerCase() === lower,
  );
}

function isServiceProduct(
  p: Pick<Product, 'isService' | 'materialType'> | undefined,
): boolean {
  if (!p) return false;
  return p.materialType === 'service' || p.isService === true;
}

/**
 * Analiz satırı: hizmet mi ürün mü.
 * Çift sayım yok — her satır tek kova. İade/iptal işareti çağıran taraftaki `total` ile gelir.
 */
export function classifyAnalysisSaleLine(
  item: AnalysisSaleLineInput,
  products: Array<Pick<Product, 'id' | 'code' | 'name' | 'isService' | 'materialType'>>,
  serviceKeys?: Set<string>,
): AnalysisSaleLineKind {
  const raw = lineTypeRaw(item);
  const rawLower = raw.toLocaleLowerCase('tr-TR');
  if (rawLower === 'package' || rawLower === 'paket') return 'service';
  if (raw && isInvoiceServiceLineType(raw)) return 'service';

  const pid = productIdKey(item);
  const pidLower = pid.toLowerCase();
  if (pidLower.startsWith('beauty-service') || pidLower.startsWith('beauty-package')) return 'service';
  if (pidLower.startsWith('beauty-product')) return 'product';

  if (pidLower && serviceKeys?.has(pidLower)) return 'service';

  const p = findCatalogProduct(products, pid);
  if (isServiceProduct(p)) return 'service';

  return 'product';
}

export function resolveAnalysisSaleCategory(
  item: AnalysisSaleLineInput,
  products: Array<CatalogProductPick>,
  beautyServices: Array<{ id?: string; name?: string; parent_category?: string; category?: string }>,
  labels: { other: string; service: string; tm: (key: string) => string },
  serviceKeys?: Set<string>,
  categoryLookup?: AnalysisCategoryLookupRow[],
): string {
  const pid = productIdKey(item);
  const p = findCatalogProduct(products, pid);

  const fromCategoryId = resolveCategoryLabel(String(p?.categoryId ?? '').trim(), categoryLookup);
  if (fromCategoryId) return fromCategoryId;

  const fromProduct = resolveCategoryLabel(
    String(p?.category ?? p?.categoryCode ?? '').trim(),
    categoryLookup,
  );
  if (fromProduct) return fromProduct;

  const nameKey = String(item.productName ?? '').trim().toLowerCase();
  const pidLower = pid.toLowerCase();
  const svc = beautyServices.find((s) => {
    const sid = String(s.id ?? '').trim();
    if (pid && (sid === pid || sid.toLowerCase() === pidLower)) return true;
    if (nameKey && String(s.name ?? '').trim().toLowerCase() === nameKey) return true;
    return false;
  });
  if (svc) {
    const key = beautyServiceMainKey(svc);
    if (key && key !== 'uncategorized' && key !== 'other') {
      const i18nKey = BEAUTY_CAT_I18N[key];
      if (i18nKey) {
        const lab = labels.tm(i18nKey);
        if (lab && lab !== i18nKey) return lab;
      }
      // slug/kod ise kategori kartından ad çözümle
      const fromLookup = resolveCategoryLabel(key, categoryLookup);
      if (fromLookup) return fromLookup;
      return key;
    }
    return labels.service;
  }

  if (classifyAnalysisSaleLine(item, products, serviceKeys) === 'service') {
    return labels.service;
  }
  return labels.other;
}

export function addAnalysisSplitAmount(
  map: Map<string, AnalysisSplitAmount>,
  key: string,
  kind: AnalysisSaleLineKind,
  amount: number,
): void {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const row = map.get(key) || { service: 0, product: 0 };
  if (kind === 'service') row.service += safe;
  else row.product += safe;
  map.set(key, row);
}

export type SaleKindBucket = 'service' | 'product' | 'mixed' | 'unknown';

export interface SaleKindAmounts {
  kind: SaleKindBucket;
  serviceNet: number;
  productNet: number;
  serviceDiscount: number;
  productDiscount: number;
  serviceBefore: number;
  productBefore: number;
}

function emptyKindAmounts(): SaleKindAmounts {
  return {
    kind: 'unknown',
    serviceNet: 0,
    productNet: 0,
    serviceDiscount: 0,
    productDiscount: 0,
    serviceBefore: 0,
    productBefore: 0,
  };
}

/**
 * Fiş kalemlerini hizmet / ürün olarak böler; başlık indirimini orantılı dağıtır.
 * Karma fişte her iki kova da dolu kalır — günlük rapor filtresi buna göre ayırır.
 */
export function allocateSaleKindAmounts(
  items: Array<AnalysisSaleLineInput & { total?: number }>,
  headerNet: number,
  headerDiscount: number,
  headerBefore: number,
  products: Array<Pick<Product, 'id' | 'code' | 'name' | 'isService' | 'materialType'>>,
  serviceKeys?: Set<string>,
): SaleKindAmounts {
  let serviceRaw = 0;
  let productRaw = 0;
  for (const it of items || []) {
    const amt = Number(it.total) || 0;
    if (classifyAnalysisSaleLine(it, products, serviceKeys) === 'service') serviceRaw += amt;
    else productRaw += amt;
  }
  const rawSum = serviceRaw + productRaw;
  if (!Number.isFinite(rawSum) || rawSum === 0) return emptyKindAmounts();

  const serviceRatio = serviceRaw / rawSum;
  const productRatio = productRaw / rawSum;
  const net = Number(headerNet);
  const disc = Number(headerDiscount);
  const before = Number(headerBefore);
  const safeNet = Number.isFinite(net) ? net : rawSum;
  const safeDisc = Number.isFinite(disc) ? disc : 0;
  const safeBefore = Number.isFinite(before) && before !== 0 ? before : safeNet + safeDisc;
  const kind: SaleKindBucket =
    Math.abs(serviceRaw) > 0.0001 && Math.abs(productRaw) > 0.0001
      ? 'mixed'
      : Math.abs(serviceRaw) > 0.0001
        ? 'service'
        : 'product';
  return {
    kind,
    serviceNet: safeNet * serviceRatio,
    productNet: safeNet * productRatio,
    serviceDiscount: safeDisc * serviceRatio,
    productDiscount: safeDisc * productRatio,
    serviceBefore: safeBefore * serviceRatio,
    productBefore: safeBefore * productRatio,
  };
}

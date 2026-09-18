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

function findCatalogProduct(
  products: Array<Pick<Product, 'id' | 'code' | 'name' | 'isService' | 'materialType' | 'category' | 'categoryCode'>>,
  productId: string,
): (typeof products)[number] | undefined {
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
  products: Array<Pick<Product, 'id' | 'code' | 'name' | 'isService' | 'materialType' | 'category' | 'categoryCode'>>,
  beautyServices: Array<{ id?: string; name?: string; parent_category?: string; category?: string }>,
  labels: { other: string; service: string; tm: (key: string) => string },
  serviceKeys?: Set<string>,
): string {
  const pid = productIdKey(item);
  const p = findCatalogProduct(products, pid);
  const fromProduct = String(p?.category ?? p?.categoryCode ?? '').trim();
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

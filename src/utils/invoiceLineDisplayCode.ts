/**
 * Fatura satırı: Kod kolonunda ürün/hizmet kodu (000001, PROD-…, barkod).
 * Satır id / product_id UUID asla görünür koda yazılmaz.
 */
import { looksLikeUuid } from './pgUuid';

export type CatalogProduct = { id?: string; code?: string; barcode?: string };
export type CatalogService = { id?: string; code?: string };

export function splitInvoiceLineIdentity(item: {
  item_code?: unknown;
  product_code?: unknown;
  code?: unknown;
  product_id?: unknown;
  productId?: unknown;
  barcode?: unknown;
}): { productId: string; code: string } {
  const pidCand = [item.product_id, item.productId, item.item_code, item.code];
  let productId = '';
  for (const c of pidCand) {
    const s = String(c ?? '').trim();
    if (looksLikeUuid(s)) {
      productId = s;
      break;
    }
  }
  const codeCand = [item.product_code, item.item_code, item.code, item.barcode];
  let code = '';
  for (const c of codeCand) {
    const s = String(c ?? '').trim();
    if (s && !looksLikeUuid(s)) {
      code = s;
      break;
    }
  }
  return { productId, code };
}

export function resolveInvoiceLineDisplayCode(
  item: { code?: unknown; productId?: unknown; item_code?: unknown; product_code?: unknown; barcode?: unknown },
  products: CatalogProduct[] = [],
  services: CatalogService[] = []
): string {
  const { productId, code } = splitInvoiceLineIdentity(item);
  if (code) return code;
  if (!productId) return '';
  const p = products.find((x) => String(x.id) === productId);
  const pCode = String(p?.code ?? '').trim();
  if (pCode && !looksLikeUuid(pCode)) return pCode;
  const pBar = String(p?.barcode ?? '').trim();
  if (pBar && !looksLikeUuid(pBar)) return pBar;
  const s = services.find((x) => String(x.id) === productId);
  const sCode = String(s?.code ?? '').trim();
  if (sCode && !looksLikeUuid(sCode)) return sCode;
  return '';
}

/** DB item_code: görünür kart kodu; UUID yazılmaz. */
export function saleItemVisibleCode(item: { code?: unknown; productId?: unknown }): string {
  return splitInvoiceLineIdentity(item).code;
}

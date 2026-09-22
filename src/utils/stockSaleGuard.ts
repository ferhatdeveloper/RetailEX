/**
 * Negatif / yetersiz stokla satış engeli.
 * Parametre: system_settings.report_menu_params → `block-negative-stock-sale` (varsayılan: kapalı).
 * Stok kaynağı: ürün kartı `stock` (satış kaydı da aynı alanı düşürür).
 * Hizmet / stoksuz (materialType=service | isService) satırlar muaf.
 */
import {
  getRuntimeReportMenuParams,
  isReportMenuParamEnabled,
  loadReportMenuParams,
  type ReportMenuParams,
} from '../services/reportMenuParamsService';
import { isInvoiceServiceLineType } from './invoiceLineType';

export const BLOCK_NEGATIVE_STOCK_SALE_PARAM = 'block-negative-stock-sale' as const;

export type StockTrackedProductLike = {
  id?: string;
  name?: string;
  stock?: number | null;
  isService?: boolean;
  materialType?: string | null;
};

export type StockSaleDemandLine = {
  productId: string;
  name?: string;
  /** Satışta düşülecek stok miktarı (base qty) */
  quantity: number;
  /** Anlık stok (ürün kartı) */
  availableStock: number;
  isService?: boolean;
  materialType?: string | null;
  /** Fatura satır türü — Hizmet ise muaf */
  lineType?: string | null;
};

export type InsufficientStockHit = {
  productId: string;
  name: string;
  availableStock: number;
  requestedQty: number;
  projectedStock: number;
};

/** Hizmet / stoksuz ürün — stok engelinden muaf */
export function isStockExemptFromSaleGuard(
  product: Pick<StockTrackedProductLike, 'isService' | 'materialType'> | null | undefined,
  lineType?: string | null,
): boolean {
  if (lineType != null && String(lineType).trim() !== '' && isInvoiceServiceLineType(lineType)) {
    return true;
  }
  if (!product) return false;
  if (product.isService === true) return true;
  const mt = String(product.materialType || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return mt === 'service' || mt === 'hizmet';
}

/** Engelleme parametresi açık mı? (varsayılan: false = satılabilir) */
export function isBlockNegativeStockSaleEnabled(params?: ReportMenuParams): boolean {
  return isReportMenuParamEnabled(BLOCK_NEGATIVE_STOCK_SALE_PARAM, params);
}

/** API katmanı / toast yokken Türkçe yedek metinler */
export const STOCK_SALE_MESSAGE_FALLBACKS: Record<string, string> = {
  stockSaleOutOfStock: 'Stokta ürün yok',
  stockSaleNegativeNotAllowed: 'Negatif seviye kayıt yapılamaz',
  stockSaleOutOfStockDetail: '• {name}: stokta yok',
  stockSaleNegativeDetail: '• {name}: mevcut {available}, talep {requested}',
  stockSaleMoreItems: '… ve {count} ürün daha',
};

export function stockSaleTmFallback(key: string): string {
  return STOCK_SALE_MESSAGE_FALLBACKS[key] || key;
}

/** DB’den güncel parametre (API / ödeme anı) — hata olursa varsayılan: izin ver */
export async function isBlockNegativeStockSaleEnabledAsync(): Promise<boolean> {
  try {
    const p = await loadReportMenuParams();
    return p[BLOCK_NEGATIVE_STOCK_SALE_PARAM] === true;
  } catch {
    return getRuntimeReportMenuParams()[BLOCK_NEGATIVE_STOCK_SALE_PARAM] === true;
  }
}

/**
 * Tek satır: mevcut stok − talep < 0 ise yetersiz.
 * Stok 0 iken herhangi bir pozitif talep engellenir.
 */
export function wouldCauseNegativeOrZeroShortage(
  availableStock: number,
  requestedQty: number,
): boolean {
  const avail = Number(availableStock);
  const qty = Number(requestedQty);
  if (!Number.isFinite(qty) || qty <= 0) return false;
  const stock = Number.isFinite(avail) ? avail : 0;
  return stock - qty < 0;
}

/** Aynı ürüne birden fazla satır varsa miktarları topla, yetersiz olanları döndür */
export function findInsufficientStockHits(lines: StockSaleDemandLine[]): InsufficientStockHit[] {
  const byId = new Map<
    string,
    { name: string; availableStock: number; requestedQty: number }
  >();

  for (const line of lines) {
    const id = String(line.productId || '').trim();
    if (!id) continue;
    if (isStockExemptFromSaleGuard(line, line.lineType)) continue;
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const prev = byId.get(id);
    if (prev) {
      prev.requestedQty += qty;
      if (line.name && !prev.name) prev.name = line.name;
    } else {
      byId.set(id, {
        name: String(line.name || id).trim() || id,
        availableStock: Number(line.availableStock) || 0,
        requestedQty: qty,
      });
    }
  }

  const hits: InsufficientStockHit[] = [];
  for (const [productId, row] of byId) {
    if (!wouldCauseNegativeOrZeroShortage(row.availableStock, row.requestedQty)) continue;
    hits.push({
      productId,
      name: row.name,
      availableStock: row.availableStock,
      requestedQty: row.requestedQty,
      projectedStock: row.availableStock - row.requestedQty,
    });
  }
  return hits;
}

/** UI mesajı — tm anahtarları: stockSaleOutOfStock / stockSaleNegativeNotAllowed */
export function formatInsufficientStockMessage(
  hits: InsufficientStockHit[],
  tm: (key: string) => string,
): string {
  if (!hits.length) return '';
  const first = hits[0]!;
  const detail = hits
    .slice(0, 5)
    .map((h) => {
      const avail = Number.isFinite(h.availableStock) ? h.availableStock : 0;
      if (avail <= 0) {
        return tm('stockSaleOutOfStockDetail').replace(/\{name\}/g, h.name);
      }
      return tm('stockSaleNegativeDetail')
        .replace(/\{name\}/g, h.name)
        .replace(/\{available\}/g, String(avail))
        .replace(/\{requested\}/g, String(h.requestedQty));
    })
    .join('\n');
  const head =
    first.availableStock <= 0
      ? tm('stockSaleOutOfStock')
      : tm('stockSaleNegativeNotAllowed');
  const more =
    hits.length > 5
      ? `\n${tm('stockSaleMoreItems').replace(/\{count\}/g, String(hits.length - 5))}`
      : '';
  return `${head}\n${detail}${more}`;
}

/** Sepet / fatura satırlarından demand üret (ürün stoku satırda veya map’te) */
export function buildDemandFromCartItems(
  items: Array<{
    productId?: string;
    product?: StockTrackedProductLike;
    quantity?: number;
    multiplier?: number;
    baseQuantity?: number;
    name?: string;
    productName?: string;
    lineType?: string;
    type?: string;
  }>,
  stockById?: Map<string, number>,
): StockSaleDemandLine[] {
  const out: StockSaleDemandLine[] = [];
  for (const item of items) {
    const product = item.product;
    const id = String(item.productId || product?.id || '').trim();
    if (!id) continue;
    const baseQty =
      item.baseQuantity != null && Number.isFinite(Number(item.baseQuantity))
        ? Number(item.baseQuantity)
        : Number(item.quantity || 0) * (Number(item.multiplier) || 1);
    const avail =
      stockById?.get(id) ??
      (product?.stock != null ? Number(product.stock) : 0);
    out.push({
      productId: id,
      name: item.name || item.productName || product?.name,
      quantity: baseQty,
      availableStock: avail,
      isService: product?.isService,
      materialType: product?.materialType,
      lineType: item.lineType || item.type,
    });
  }
  return out;
}

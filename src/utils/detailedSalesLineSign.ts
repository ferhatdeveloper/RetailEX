/**
 * Detaylı Satış Raporu — iade satırının işareti.
 *
 * Fiş başlığı satış iadesinde eksi (veya durum return) olabilir; kalemler
 * veritabanında artı miktar ve artı satır tutarı olarak durur. Izgara bu
 * artı tutarları grup ve genel toplama eklerse iade ciroya yazılır
 * (110.000 + 20.000 + 10.000 = 140.000).
 *
 * Doğru net: hizmet 110.000 + ürün satışı 20.000 − iade 10.000 = 120.000.
 * İade bir kez eksi yazılır. Girdi zaten eksiyse ikinci işaret 0 üretmez.
 * Birim fiyat satış fiyatı olarak artı kalır. Alış iadesi (trcode 6) bu
 * satış cirosundan düşülmez. Peşinat fişi bu fonksiyona gelmeden önce
 * rapor tarafında elenir.
 */

import { isSalesReturnFiche, PURCHASE_RETURN_TRCODE } from './lastPurchaseCostSql';

const EPS = 1e-9;

const CANCELLED_STATUS = new Set([
  'cancelled',
  'canceled',
  'iptal',
  'void',
  'silindi',
  'deleted',
]);

export interface DetailedSalesReturnInput {
  status?: string | null;
  total?: number | null;
  trcode?: number | null;
  invoice_type?: number | null;
  fiche_type?: string | null;
  ficheType?: string | null;
}

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Müşteri satış iadesi (trcode 2/3, durum return/refunded, eksi fiş). Alış iadesi değil. */
export function isDetailedSalesReturnDocument(
  sale: DetailedSalesReturnInput | null | undefined,
): boolean {
  if (!sale) return false;
  const tr = Number(sale.trcode ?? sale.invoice_type ?? 0) || 0;
  const fiche = String(sale.fiche_type ?? sale.ficheType ?? '').trim().toLowerCase();
  if (tr === PURCHASE_RETURN_TRCODE) return false;
  if (fiche === 'purchase_invoice') return false;

  const status = String(sale.status ?? '').trim().toLowerCase();
  if (status === 'return' || status === 'refunded') return true;
  if (tr === 2 || tr === 3) return true;
  if (isSalesReturnFiche({ fiche_type: fiche, trcode: tr })) return true;
  if (CANCELLED_STATUS.has(status)) return false;

  const header = Number(sale.total);
  return Number.isFinite(header) && header < -EPS;
}

/**
 * Satır miktarı ve satır toplamı. İade bir kez eksi; birim fiyat artı.
 * İkinci çağrı aynı eksi tutarı korur.
 */
export function signDetailedSalesLine(
  isReturn: boolean,
  quantity: number,
  lineTotal: number,
  unitPrice = 0,
): { qty: number; price: number; total: number } {
  const qty = finite(quantity);
  const total = finite(lineTotal);
  const priceIn = finite(unitPrice);
  if (!isReturn) {
    const price = Math.abs(qty) > EPS ? total / qty : priceIn;
    return { qty, price, total };
  }
  const signedQty = Math.abs(qty) <= EPS ? 0 : -Math.abs(qty);
  const signedTotal = Math.abs(total) <= EPS ? 0 : -Math.abs(total);
  const price = Math.abs(signedQty) > EPS
    ? Math.abs(signedTotal) / Math.abs(signedQty)
    : Math.abs(priceIn);
  return { qty: signedQty, price, total: signedTotal };
}

export interface DetailedSalesLineMoney {
  qty: number;
  price: number;
  total: number;
  isReturn: boolean;
}

/** Rapor satırına yazılan miktar, birim fiyat ve satır toplamı. */
export function detailedSalesLineMoney(
  sale: DetailedSalesReturnInput | null | undefined,
  item: { quantity?: number | null; total?: number | null; price?: number | null },
): DetailedSalesLineMoney {
  const isReturn = isDetailedSalesReturnDocument(sale);
  const signed = signDetailedSalesLine(
    isReturn,
    finite(item.quantity),
    finite(item.total),
    finite(item.price),
  );
  return { ...signed, isReturn };
}

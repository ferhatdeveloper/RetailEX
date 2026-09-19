/**
 * SKT raporu Miktar: alış fatura satır miktarı değil, güncel stok / lot kalanı.
 * Envanter Listesi (products.stock) ve lot.quantity ile hizalar.
 */

export type ExpiryQtyAlignRow = {
  invoiceId: string;
  itemCode: string;
  itemName: string;
  productId?: string;
  expiryDate: string;
  batchNo?: string;
  quantity: number;
};

/** Ürün anahtarı: productId → kod → ad (stok eşlemesi için) */
export function expiryProductStockKey(row: {
  productId?: string;
  itemCode?: string;
  itemName?: string;
}): string {
  const pid = String(row.productId || '').trim();
  if (pid) return `id:${pid}`;
  const code = String(row.itemCode || '').trim();
  if (code) return `code:${code}`;
  return `name:${String(row.itemName || '').trim()}`;
}

export function expiryLotMatchKey(row: {
  productId?: string;
  itemCode?: string;
  itemName?: string;
  expiryDate: string;
  batchNo?: string;
}): string {
  return `${expiryProductStockKey(row)}|${row.expiryDate}|${String(row.batchNo || '').trim()}`;
}

function rowPriority(row: ExpiryQtyAlignRow): number {
  const hasInvoice = Boolean(String(row.invoiceId || '').trim());
  const hasBatch = Boolean(String(row.batchNo || '').trim());
  if (hasInvoice) return 3;
  if (hasBatch) return 2;
  return 1;
}

/**
 * Fatura satırı kazanırsa miktarı lot/kart kaynağından al (güncel kalan).
 * Aksi halde daha yüksek miktarı koru.
 */
function mergeQuantity(winner: ExpiryQtyAlignRow, other: ExpiryQtyAlignRow): number {
  const wInv = Boolean(String(winner.invoiceId || '').trim());
  const oInv = Boolean(String(other.invoiceId || '').trim());
  if (wInv && !oInv) return Number(other.quantity) || 0;
  if (!wInv && oInv) return Number(winner.quantity) || 0;
  return Math.max(Number(winner.quantity) || 0, Number(other.quantity) || 0);
}

/**
 * Aynı ürün+SKT+parti için çift satırları birleştir.
 * Öncelik: fatura satırı > lot (parti) > ürün kartı.
 */
export function dedupeExpiryRowsBySkuSkt<T extends ExpiryQtyAlignRow>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    if (!row.expiryDate) continue;
    const key = expiryLotMatchKey(row);
    const prev = best.get(key);
    if (!prev) {
      best.set(key, row);
      continue;
    }
    const pWin = rowPriority(row);
    const pPrev = rowPriority(prev);
    if (pWin > pPrev) {
      best.set(key, { ...row, quantity: mergeQuantity(row, prev) });
    } else if (pWin < pPrev) {
      best.set(key, { ...prev, quantity: mergeQuantity(prev, row) });
    } else {
      best.set(key, {
        ...prev,
        quantity: Math.max(Number(prev.quantity) || 0, Number(row.quantity) || 0),
      });
    }
  }
  return Array.from(best.values());
}

/**
 * Satır miktarlarını güncel stok / lot kalanı ile hizala.
 *
 * - `lotQtyByKey` eşleşmesi varsa lot miktarı (parti+SKT)
 * - Aksi halde ürün stokunu aynı ürüne ait satırlara FEFO verir:
 *   en erken SKT satırı tüm kalan stoğu alır; diğerleri 0
 *   (böylece ürün bazında Miktar toplamı Envanter Listesi ile örtüşür)
 * - Stok anahtarı yoksa satır miktarı değişmez
 */
export function alignExpiryQuantitiesToStock<T extends ExpiryQtyAlignRow>(
  rows: T[],
  stockByProductKey: Map<string, number>,
  lotQtyByKey?: Map<string, number>,
): T[] {
  if (!rows.length) return rows;

  const lotMap = lotQtyByKey || new Map<string, number>();
  const out: T[] = rows.map((r) => ({ ...r }));
  const lotFixed = new Set<number>();
  const stockLeft = new Map<string, number>();

  for (const [k, v] of stockByProductKey) {
    stockLeft.set(k, Math.max(0, Number(v) || 0));
  }

  for (let i = 0; i < out.length; i++) {
    const row = out[i];
    const lk = expiryLotMatchKey(row);
    if (!lotMap.has(lk)) continue;
    const lotQty = Math.max(0, Number(lotMap.get(lk)) || 0);
    out[i] = { ...row, quantity: lotQty };
    lotFixed.add(i);
    const pk = expiryProductStockKey(row);
    if (stockLeft.has(pk) || stockByProductKey.has(pk)) {
      stockLeft.set(pk, Math.max(0, (stockLeft.get(pk) ?? stockByProductKey.get(pk) ?? 0) - lotQty));
    }
  }

  const byProduct = new Map<string, number[]>();
  for (let i = 0; i < out.length; i++) {
    if (lotFixed.has(i)) continue;
    const pk = expiryProductStockKey(out[i]);
    if (!stockByProductKey.has(pk) && !stockLeft.has(pk)) continue;
    const list = byProduct.get(pk) || [];
    list.push(i);
    byProduct.set(pk, list);
  }

  for (const [pk, indices] of byProduct) {
    indices.sort((a, b) => {
      const cmp = out[a].expiryDate.localeCompare(out[b].expiryDate);
      return cmp !== 0 ? cmp : a - b;
    });
    let remaining = Math.max(0, stockLeft.get(pk) ?? stockByProductKey.get(pk) ?? 0);
    for (const idx of indices) {
      out[idx] = { ...out[idx], quantity: remaining };
      remaining = 0;
    }
  }

  return out;
}

/** Dedupe + stok/lot hizalama (rapor pipeline) */
export function finalizeExpiryReportQuantities<T extends ExpiryQtyAlignRow>(
  rows: T[],
  stockByProductKey: Map<string, number>,
  lotQtyByKey?: Map<string, number>,
): T[] {
  const deduped = dedupeExpiryRowsBySkuSkt(rows);
  return alignExpiryQuantitiesToStock(deduped, stockByProductKey, lotQtyByKey);
}

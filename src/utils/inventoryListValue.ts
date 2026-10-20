/**
 * Envanter Listesi — alış birimi ile stok değeri aynı taban.
 *
 * Alış fiyatı sırası (ekranda görünen):
 *   1) ağırlıklı ortalama (fatura dip indirimi satıra yayılmış)
 *   2) FIFO katman ortalaması
 *   3) kart alış (cost → purchase_price)
 *
 * Toplam değer = eldeki miktar × bu birim.
 * FIFO katman toplamı (satır neti, dip indirim ölçeklenmemiş) kullanılmaz.
 * Aksi halde birim 5.500 görünürken katman brütü 105.000 yazılır
 * (19 × 5.526,315…); alış birimi 5.526’ya çekilerek 105.000 haklı çıkarılmaz.
 *
 * Satış değeri ayrıdır: miktar × satış fiyatı. Maliyeti değiştirmez.
 */

function positiveNumber(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function inventoryListUnitPurchaseCost(opts: {
  weightedAvg?: unknown;
  layeredAvg?: unknown;
  cardUnit?: unknown;
}): number {
  const weighted = positiveNumber(opts.weightedAvg);
  if (weighted > 0) return weighted;
  const layered = positiveNumber(opts.layeredAvg);
  if (layered > 0) return layered;
  return positiveNumber(opts.cardUnit);
}

/** Stok değeri = eldeki miktar × ekrandaki birim alış. */
export function inventoryListStockValue(qty: unknown, unitPurchase: unknown): number {
  const q = Number(qty);
  const u = Number(unitPurchase);
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  return q * u;
}

/** Satış değeri = eldeki miktar × satış fiyatı. Stok maliyetinden bağımsız. */
export function inventoryListSalesValue(qty: unknown, saleUnit: unknown): number {
  const q = Number(qty);
  const u = Number(saleUnit);
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  return q * u;
}

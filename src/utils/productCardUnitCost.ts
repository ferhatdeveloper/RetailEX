/**
 * Ürün kartı birim maliyet — stok değerleme (Depo Stok Özeti, Stok Durumu, Kritik Stok).
 *
 * Formül: stokDeğeri = miktar × birimMaliyet
 * birimMaliyet önceliği:
 *   1) products.cost (kart maliyet / ortalama alış)
 *   2) products.purchase_price (kart alış fiyatı)
 *
 * Satış fiyatı (price / price_list_*) KULLANILMAZ — bilanço stok değerini şişirmesin.
 * Cost ve alış da 0/null ise birim maliyet 0 kalır (satış fiyatına düşülmez).
 */

export type ProductCardCostLike = {
  cost?: number | null;
  purchase_price?: number | null;
  purchasePrice?: number | null;
};

function positiveNumber(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Kart birim maliyet: cost → purchase_price; satış fiyatı yok. */
export function productCardUnitCost(p: ProductCardCostLike | null | undefined): number {
  if (!p) return 0;
  const cost = positiveNumber(p.cost);
  if (cost > 0) return cost;
  return positiveNumber(p.purchase_price ?? p.purchasePrice);
}

/** stok × kart birim maliyet */
export function stockValueAtCardCost(
  qty: number,
  p: ProductCardCostLike | null | undefined,
): number {
  return (Number(qty) || 0) * productCardUnitCost(p);
}

/**
 * SQL ifadesi — `products` alias `p`.
 * COALESCE(NULLIF(cost,0), NULLIF(purchase_price,0), 0)
 */
export const SQL_PRODUCT_CARD_UNIT_COST =
  `COALESCE(NULLIF(p.cost, 0), NULLIF(p.purchase_price, 0), 0)`;

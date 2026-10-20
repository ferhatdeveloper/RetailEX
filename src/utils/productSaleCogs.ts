/**
 * Ürün satılan malın maliyeti.
 *
 * SMM = işaretli satılan miktar × envanter birim alış.
 * Birim alış, envanter listesiyle aynı sıradır
 * (ağırlıklı ortalama → katman ortalaması → kart alış).
 *
 * Satış gelirinin oranı maliyet değildir. 10.000 gelirin %50'si 5.000
 * yazılmaz; alış 5.500 ve adet 1 ise SMM 5.500, brüt kâr 4.500'tür.
 * Hizmet satırları bu fonksiyona girmez.
 */

export function productCogsFromUnitPurchase(quantity: number, unitPurchase: number): number {
  const qty = Number(quantity) || 0;
  const unit = Number(unitPurchase) || 0;
  if (!(Math.abs(qty) > 0) || !(unit > 0)) return 0;
  return qty * unit;
}

export function grossProfitAfterCogs(
  revenue: number,
  cogs: number,
): { profit: number; marginPercent: number } {
  const rev = Number(revenue) || 0;
  const cost = Number(cogs) || 0;
  const profit = rev - cost;
  const marginPercent = Math.abs(rev) > 0.009 ? (profit / rev) * 100 : 0;
  return { profit, marginPercent };
}

/**
 * Ürün satırının SMM ve brüt kârı. Gelir maliyete karışmaz.
 */
export function productSaleCogs(opts: {
  quantity: number;
  revenue: number;
  unitPurchase: number;
}): { cogs: number; profit: number; marginPercent: number } {
  const cogs = productCogsFromUnitPurchase(opts.quantity, opts.unitPurchase);
  const { profit, marginPercent } = grossProfitAfterCogs(opts.revenue, cogs);
  return { cogs, profit, marginPercent };
}

/**
 * Ürün Brüt Kârı marjı.
 * Marj % = brüt kâr / net ciro × 100 = (net ciro − maliyet) / net ciro × 100.
 * İki ondalık. Net ciro 0 ise 0; bölme yapılmaz.
 */

const REVENUE_EPSILON = 0.009;

function roundMarginPct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const sign = raw < 0 ? -1 : 1;
  const scaled = Math.abs(raw) * 100;
  return (sign * Math.round(scaled + 1e-8)) / 100;
}

/** Satır veya dip toplam marjı. Payda net cirodur. */
export function productGrossProfitMarginPct(netRevenue: number, grossProfit: number): number {
  const rev = Number(netRevenue);
  const profit = Number(grossProfit);
  if (!Number.isFinite(rev) || !Number.isFinite(profit)) return 0;
  if (Math.abs(rev) <= REVENUE_EPSILON) return 0;
  return roundMarginPct((profit / rev) * 100);
}

/**
 * Dip toplam: satır yüzdelerinin toplamı değil, toplam brüt kâr / toplam net ciro.
 */
export function productGrossProfitMarginPctFromRows(
  rows: ReadonlyArray<{ revenue?: number; grossProfit?: number }>,
): number {
  let rev = 0;
  let profit = 0;
  for (const r of rows) {
    const rowRev = Number(r.revenue);
    const rowProfit = Number(r.grossProfit);
    if (Number.isFinite(rowRev)) rev += rowRev;
    if (Number.isFinite(rowProfit)) profit += rowProfit;
  }
  return productGrossProfitMarginPct(rev, profit);
}

/** Izgara ve dip toplam metni: her zaman iki ondalık, Türkçe ayraç (66,67). */
export function formatProductGrossProfitMarginPct(marginPct: number): string {
  const n = Number(marginPct);
  const safe = Number.isFinite(n) ? n : 0;
  const sign = safe < 0 ? '-' : '';
  const [whole, frac] = Math.abs(safe).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped},${frac}`;
}

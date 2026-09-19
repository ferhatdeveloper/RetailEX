/**
 * Fiyat değişim fişi sapması — son fiş alış/satış ile ürün kartını karşılaştırır.
 * Stok miktarı değişmez; sonuç denetim kaydı için kullanılır.
 */

export type PriceDriftProduct = {
  id: string;
  code?: string;
  name?: string;
  unit?: string;
  cost?: number;
  price?: number;
};

export type PriceDriftCandidate = {
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string;
  current_cost: number;
  current_price: number;
  last_slip_cost: number;
  last_slip_price: number;
};

const EPS = 0.0000001;

export function pricesDiffer(a: number, b: number): boolean {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) > EPS;
}

function movementSortKey(m: { movement_date?: string; created_at?: string }): number {
  const a = new Date(m.movement_date || m.created_at || 0).getTime();
  return Number.isFinite(a) ? a : 0;
}

/** Ürün başına en son fiyat değişim fişindeki alış (cost_price) / satış (unit_price). */
export function latestSlipPriceByProduct(
  movements: Array<{ id: string; movement_date?: string; created_at?: string }>,
  items: Array<{
    movement_id?: string;
    product_id?: string;
    cost_price?: number;
    unit_price?: number;
  }>,
): Map<string, { cost: number; price: number }> {
  const byId = new Map(movements.map((m) => [String(m.id), m]));
  const ranked = [...items].sort((a, b) => {
    const ma = byId.get(String(a.movement_id || ''));
    const mb = byId.get(String(b.movement_id || ''));
    return movementSortKey(mb || {}) - movementSortKey(ma || {});
  });
  const out = new Map<string, { cost: number; price: number }>();
  for (const it of ranked) {
    const pid = String(it.product_id || '').trim();
    if (!pid || out.has(pid)) continue;
    if (!byId.has(String(it.movement_id || ''))) continue;
    out.set(pid, {
      cost: Number(it.cost_price) || 0,
      price: Number(it.unit_price) || 0,
    });
  }
  return out;
}

export function computePriceDriftCandidates(
  lastByProduct: Map<string, { cost: number; price: number }>,
  products: PriceDriftProduct[],
): PriceDriftCandidate[] {
  const rows: PriceDriftCandidate[] = [];
  for (const p of products) {
    const last = lastByProduct.get(String(p.id));
    if (!last) continue;
    const current_cost = Number(p.cost) || 0;
    const current_price = Number(p.price) || 0;
    if (!pricesDiffer(current_cost, last.cost) && !pricesDiffer(current_price, last.price)) continue;
    rows.push({
      product_id: String(p.id),
      product_code: String(p.code || '').trim(),
      product_name: String(p.name || '').trim(),
      unit: String(p.unit || 'Adet'),
      current_cost,
      current_price,
      last_slip_cost: last.cost,
      last_slip_price: last.price,
    });
  }
  rows.sort((a, b) => a.product_code.localeCompare(b.product_code, 'tr') || a.product_name.localeCompare(b.product_name, 'tr'));
  return rows.slice(0, 2000);
}

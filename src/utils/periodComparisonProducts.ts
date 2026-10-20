/**
 * Dönem karşılaştırma — ürün adedi ve ciro.
 *
 * Kök neden: fiş başlığı iadeyi net cirodan düşer (KPI 120.000),
 * ürün satırı ise veritabanındaki artı miktar ve tutarı olduğu gibi ekler.
 * 2×10.000 satış + 1×10.000 iade böylece 3 adet ve 30.000 olur;
 * tablo toplamı 140.000'e çıkar.
 *
 * Muhasebe: satış artı, iade eksi. İade bir kez düşülür.
 * Satır zaten eksi ise ikinci kez çevrilmez (20.000 − 10.000 − 10.000 = 0 olmaz).
 * Aynı fiş kimliği listede iki kez gelse de bir kez yazılır.
 * Peşinat ayrı fiştir; bu fonksiyon yalnızca verilen satırları toplar.
 */
import type { Sale } from '../core/types';
import { isReturnSale } from './posZReport';

export type ComparisonProductLine = {
  productName?: string | null;
  productId?: string | null;
  quantity?: number | null;
  total?: number | null;
};

export type ComparisonSaleForProducts = {
  id?: string;
  total?: number;
  status?: string;
  items?: ComparisonProductLine[];
};

export type ComparisonProductBucket = {
  qty: number;
  revenue: number;
};

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * İade fişinde satır artı duruyorsa bir kez eksiye çevrilir.
 * Satır zaten eksi ise işaret korunur.
 */
export function signedComparisonProductLine(
  sale: { total?: number; status?: string },
  line: ComparisonProductLine,
): { qty: number; revenue: number } {
  const rawQty = finite(line.quantity);
  const rawRev = finite(line.total);
  if (!isReturnSale(sale as Sale)) {
    return { qty: rawQty, revenue: rawRev };
  }
  return {
    qty: rawQty < 0 ? rawQty : -Math.abs(rawQty),
    revenue: rawRev < 0 ? rawRev : -Math.abs(rawRev),
  };
}

export function accumulateComparisonProducts<T extends ComparisonSaleForProducts>(
  sales: readonly T[],
  linesOf?: (sale: T) => readonly ComparisonProductLine[],
): Map<string, ComparisonProductBucket> {
  const read = linesOf ?? ((sale: T) => sale.items || []);
  const productMap = new Map<string, ComparisonProductBucket>();
  const seen = new Set<string>();

  for (const sale of sales) {
    const sid = String(sale.id || '').trim();
    if (sid) {
      if (seen.has(sid)) continue;
      seen.add(sid);
    }
    for (const line of read(sale)) {
      const name =
        (line.productName && String(line.productName).trim()) ||
        String(line.productId || '—');
      const cur = productMap.get(name) || { qty: 0, revenue: 0 };
      const delta = signedComparisonProductLine(sale, line);
      cur.qty += delta.qty;
      cur.revenue += delta.revenue;
      productMap.set(name, cur);
    }
  }

  return productMap;
}

export function sumComparisonProducts(
  map: Map<string, ComparisonProductBucket>,
): ComparisonProductBucket {
  let qty = 0;
  let revenue = 0;
  for (const row of map.values()) {
    qty += row.qty;
    revenue += row.revenue;
  }
  return { qty, revenue };
}

/**
 * Günlük raporda rezervasyon avansı veresiye değildir.
 * Belge kalanından, aynı müşterinin henüz satış kırılımına yazılmamış
 * avansı düşülür. Tahsilat ve kasa toplamına eklenmez; rezervasyon kartı
 * ayrı kalır.
 */

export interface SaleRemainingRow {
  id: string;
  customerId: string;
  remaining: number;
}

export interface ReservationAvansRow {
  customerId: string;
  amount: number;
  status?: string | null;
  appliedSaleId?: string | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function offsetSaleRemainingWithReservation(
  sales: SaleRemainingRow[],
  avans: ReservationAvansRow[],
  appliedBySaleId: ReadonlyMap<string, number>,
): Map<string, number> {
  const credited = new Set<string>();
  for (const [saleId, amt] of appliedBySaleId) {
    if (Math.abs(Number(amt) || 0) > 0.004) credited.add(String(saleId));
  }

  const pool = new Map<string, number>();
  let unassigned = 0;
  for (const row of avans) {
    const amount = Math.abs(Number(row.amount) || 0);
    if (amount <= 0.004) continue;
    const appliedId = String(row.appliedSaleId || '').trim();
    const status = String(row.status || '').trim().toLowerCase();
    if (status === 'applied' && appliedId && credited.has(appliedId)) continue;
    const customerId = String(row.customerId || '').trim();
    if (!customerId) {
      unassigned += amount;
      continue;
    }
    pool.set(customerId, (pool.get(customerId) || 0) + amount);
  }

  const out = new Map<string, number>();
  for (const sale of sales) {
    let remaining = Math.max(0, Number(sale.remaining) || 0);
    const customerId = String(sale.customerId || '').trim();
    if (remaining > 0 && customerId) {
      const available = pool.get(customerId) || 0;
      const used = Math.min(remaining, available);
      remaining = round2(remaining - used);
      pool.set(customerId, round2(available - used));
    }
    out.set(String(sale.id), remaining);
  }

  const stillOpen = sales.filter((sale) => (out.get(String(sale.id)) || 0) > 0.004);
  if (sales.length === 1 && stillOpen.length === 1) {
    let leftover = unassigned;
    for (const value of pool.values()) leftover += Math.max(0, value);
    const only = stillOpen[0];
    const remaining = out.get(String(only.id)) || 0;
    out.set(String(only.id), round2(remaining - Math.min(remaining, leftover)));
  }
  return out;
}

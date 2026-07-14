import { pgQuery } from './pgClient';
import { cashLinesTable, firmNr, periodNr, productsTable, salesTable } from './erpTables';

export type DashboardStats = {
  totalRevenue: number;
  totalTransactions: number;
  avgBasket: number;
  activeStores: number;
  totalStores: number;
  criticalAlerts: number;
  productCount: number;
  customerCount: number;
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const products = productsTable(fn);
  const empty: DashboardStats = {
    totalRevenue: 0,
    totalTransactions: 0,
    avgBasket: 0,
    activeStores: 0,
    totalStores: 0,
    criticalAlerts: 0,
    productCount: 0,
    customerCount: 0,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const t0 = today.toISOString();
  const t1 = tomorrow.toISOString();

  try {
    const [salesRes, storesRes, alertRes, prodRes, custRes] = await Promise.all([
      pgQuery<{ revenue: string | number; count: string | number }>(
        `SELECT
           COALESCE(SUM(COALESCE(net_amount, total_net, total_gross, 0)), 0)::numeric AS revenue,
           COUNT(*)::int AS count
         FROM ${sales}
         WHERE created_at >= $1 AND created_at < $2
           AND COALESCE(is_cancelled, false) = false`,
        [t0, t1],
      ).catch(() => ({ rows: [{ revenue: 0, count: 0 }], rowCount: 1 })),
      pgQuery<{ total: string | number; active: string | number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true)::int AS active
         FROM stores
         WHERE firm_nr = $1 OR LPAD(TRIM(COALESCE(firm_nr,'')), 3, '0') = $1`,
        [fn],
      ).catch(() => ({ rows: [{ total: 0, active: 0 }], rowCount: 1 })),
      pgQuery<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM ${products}
         WHERE min_stock IS NOT NULL
           AND COALESCE(stock, 0) < min_stock
           AND COALESCE(is_active, true) = true`,
      ).catch(() => ({ rows: [{ count: 0 }], rowCount: 1 })),
      pgQuery<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count FROM ${products} WHERE COALESCE(is_active, true) = true`,
      ).catch(() => ({ rows: [{ count: 0 }], rowCount: 1 })),
      pgQuery<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count FROM rex_${fn}_customers WHERE COALESCE(is_active, true) = true`,
      ).catch(() => ({ rows: [{ count: 0 }], rowCount: 1 })),
    ]);

    const totalRevenue = Number(salesRes.rows[0]?.revenue ?? 0);
    const totalTransactions = Number(salesRes.rows[0]?.count ?? 0);
    const totalStores = Number(storesRes.rows[0]?.total ?? 0);
    const activeStores = Number(storesRes.rows[0]?.active ?? 0);
    const criticalAlerts = Number(alertRes.rows[0]?.count ?? 0);
    const productCount = Number(prodRes.rows[0]?.count ?? 0);
    const customerCount = Number(custRes.rows[0]?.count ?? 0);
    const avgBasket = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

    return {
      totalRevenue,
      totalTransactions,
      avgBasket,
      activeStores,
      totalStores,
      criticalAlerts,
      productCount,
      customerCount,
    };
  } catch {
    return empty;
  }
}

/** Kasa bakiyesi özeti — opsiyonel */
export async function fetchCashHint(): Promise<number> {
  try {
    const table = cashLinesTable();
    const res = await pgQuery<{ bal: string | number }>(
      `SELECT COALESCE(SUM(COALESCE(amount,0) * COALESCE(sign,1)), 0)::numeric AS bal
       FROM ${table}
       WHERE created_at::date = CURRENT_DATE`,
    );
    return Number(res.rows[0]?.bal ?? 0);
  } catch {
    return 0;
  }
}

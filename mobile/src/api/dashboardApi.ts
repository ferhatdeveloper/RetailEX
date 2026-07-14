import { pgQuery } from './pgClient';
import { firmNr, periodNr, productsTable, salesTable, storeId } from './erpTables';
import { useAuthStore } from '../store/authStore';

/** Web `saleInvoiceStatus.ts` — `SQL_COUNTABLE_SALE_STATUS_PLAIN` */
const SQL_COUNTABLE_SALE = `COALESCE(status, 'approved') IN ('completed', 'approved')`;

export type DashboardStats = {
  totalRevenue: number;
  totalTransactions: number;
  avgBasket: number;
  activeStores: number;
  totalStores: number;
  criticalAlerts: number;
};

const EMPTY_STATS: DashboardStats = {
  totalRevenue: 0,
  totalTransactions: 0,
  avgBasket: 0,
  activeStores: 0,
  totalStores: 0,
  criticalAlerts: 0,
};

function firmMatchSql(column: string, rawParam: string, paddedParam: string): string {
  return `(
    TRIM(COALESCE(${column}::text, '')) = TRIM(${rawParam}::text)
    OR LPAD(TRIM(COALESCE(${column}::text, '')), 3, '0') = ${paddedParam}
  )`;
}

/**
 * Web `dashboardAPI.getStats()` ile aynı metrikler.
 * Tarih: PG `CURRENT_DATE` + `COALESCE(date, created_at)` (reportsApi deseni).
 * Satış: iptal hariç + sayılabilir status (`completed` / `approved`).
 */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const fn = firmNr();
  const pn = periodNr();
  const rawFn = String(useAuthStore.getState().user?.firmNr ?? fn).trim();
  const sales = salesTable(fn, pn);
  const products = productsTable(fn);
  const sid = storeId();

  const salesConds = [
    'COALESCE(is_cancelled, false) = false',
    SQL_COUNTABLE_SALE,
    'COALESCE(date::date, created_at::date) = CURRENT_DATE',
    firmMatchSql('firm_nr', '$1', '$2'),
    // Alış fişleri günlük ciroya karışmasın (web SalesAPI / POS ciro ayrımı)
    `(LOWER(TRIM(COALESCE(fiche_type, ''))) IN (
        'sales_invoice', 'sales', 'retail', 'service', 'hizmet', 'return_invoice'
      ) OR COALESCE(trcode, 0) IN (0, 2, 3, 7, 8, 9, 14)
      OR (fiche_type IS NULL AND COALESCE(trcode, 0) NOT IN (1, 4, 5, 6, 13, 26, 41, 42)))`,
  ];
  const salesParams: unknown[] = [rawFn, fn];
  if (sid) {
    salesConds.push(`store_id::text = $${salesParams.length + 1}`);
    salesParams.push(sid);
  }

  try {
    const [salesRes, storesRes, alertRes] = await Promise.all([
      pgQuery<{ revenue: string | number; count: string | number }>(
        `SELECT
           COALESCE(SUM(
             (
               CASE
                 WHEN COALESCE(trcode, 0) IN (2, 3)
                   OR (
                     LOWER(TRIM(COALESCE(fiche_type, ''))) = 'return_invoice'
                     AND COALESCE(trcode, 0) NOT IN (1, 4, 5, 6, 13, 26, 41, 42)
                   )
                 THEN -1
                 ELSE 1
               END
             ) * ABS(COALESCE(net_amount, total_net, total_gross, 0))
           ), 0)::numeric AS revenue,
           COUNT(*)::int AS count
         FROM ${sales}
         WHERE ${salesConds.join(' AND ')}`,
        salesParams,
      ).catch(() => ({ rows: [{ revenue: 0, count: 0 }], rowCount: 1 })),
      pgQuery<{ total: string | number; active: string | number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true)::int AS active
         FROM stores
         WHERE ${firmMatchSql('firm_nr', '$1', '$2')}`,
        [rawFn, fn],
      ).catch(() => ({ rows: [{ total: 0, active: 0 }], rowCount: 1 })),
      pgQuery<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM ${products}
         WHERE min_stock IS NOT NULL
           AND COALESCE(stock, 0) < min_stock
           AND COALESCE(is_active, true) = true`,
      ).catch(() => ({ rows: [{ count: 0 }], rowCount: 1 })),
    ]);

    const totalRevenue = Number(salesRes.rows[0]?.revenue ?? 0);
    const totalTransactions = Number(salesRes.rows[0]?.count ?? 0);
    const totalStores = Number(storesRes.rows[0]?.total ?? 0);
    const activeStores = Number(storesRes.rows[0]?.active ?? 0);
    const criticalAlerts = Number(alertRes.rows[0]?.count ?? 0);
    const avgBasket = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

    return {
      totalRevenue,
      totalTransactions,
      avgBasket,
      activeStores,
      totalStores,
      criticalAlerts,
    };
  } catch {
    return { ...EMPTY_STATS };
  }
}

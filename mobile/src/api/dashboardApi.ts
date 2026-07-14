import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
import {
  appendStoreIdFilterAllowNull,
  firmNr,
  matchesSessionStoreAllowNull,
  periodNr,
  productsTable,
  salesTable,
  storeId,
} from './erpTables';
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

function firmMatchSql(column: string, rawParam: string, paddedParam: string): string {
  return `(
    TRIM(COALESCE(${column}::text, '')) = TRIM(${rawParam}::text)
    OR LPAD(TRIM(COALESCE(${column}::text, '')), 3, '0') = ${paddedParam}
  )`;
}

function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isCountableSaleStatus(status: unknown): boolean {
  const s = String(status ?? 'approved').trim().toLowerCase();
  return s === 'completed' || s === 'approved' || s === '';
}

function isSalesRevenueRow(r: Record<string, unknown>): boolean {
  const ft = String(r.fiche_type || '').trim().toLowerCase();
  const tr = Number(r.trcode ?? 0) || 0;
  if (
    ft === 'sales_invoice' ||
    ft === 'sales' ||
    ft === 'retail' ||
    ft === 'service' ||
    ft === 'hizmet' ||
    ft === 'return_invoice'
  ) {
    return true;
  }
  if (ft === '' && ![1, 4, 5, 6, 13, 26, 41, 42].includes(tr)) return true;
  return [0, 2, 3, 7, 8, 9, 14].includes(tr);
}

function salesRevenueSign(r: Record<string, unknown>): number {
  const tr = Number(r.trcode ?? 0) || 0;
  const ft = String(r.fiche_type || '').trim().toLowerCase();
  if (tr === 2 || tr === 3) return -1;
  if (ft === 'return_invoice' && ![1, 4, 5, 6, 13, 26, 41, 42].includes(tr)) return -1;
  return 1;
}

/** Web `dashboardAPI.getStats` rest_api dalı — satış/mağaza/ürün client aggregate */
async function fetchDashboardStatsViaRest(): Promise<DashboardStats> {
  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const products = productsTable(fn);
  const today = toYmdLocal(new Date());
  const rawFn = String(useAuthStore.getState().user?.firmNr ?? fn).trim();
  const firmCandidates = Array.from(
    new Set([fn, rawFn, fn.replace(/^0+/, '') || fn].filter(Boolean)),
  );

  const [salesList, storeList, productList] = await Promise.all([
    postgrestGet<Record<string, unknown>[]>(
      `/${sales}`,
      {
        // Bugün KPI — dar select + tarih filtresi (geçici 502 / ağır payload azaltır).
        // store_id boş fişler client’ta matchesSessionStoreAllowNull ile dahil kalır.
        select:
          'net_amount,total_net,total_gross,date,created_at,fiche_type,trcode,is_cancelled,store_id,status,firm_nr',
        or: `(date.eq.${today},and(date.is.null,created_at.gte.${today}T00:00:00))`,
        order: 'date.desc',
        limit: 2000,
      },
      { schema: 'public' },
    ),
    postgrestGet<Array<{ id?: string; is_active?: boolean; firm_nr?: string }>>(
      '/stores',
      {
        select: 'id,is_active,firm_nr',
        or: `(${firmCandidates.map((f) => `firm_nr.eq.${f}`).join(',')})`,
        limit: 500,
      },
      { schema: 'public' },
    ).catch(() => [] as Array<{ id?: string; is_active?: boolean; firm_nr?: string }>),
    postgrestGet<Array<{ stock?: number; min_stock?: number | null; is_active?: boolean }>>(
      `/${products}`,
      {
        select: 'stock,min_stock,is_active',
        is_active: 'eq.true',
        limit: 5000,
      },
      { schema: 'public' },
    ).catch(() => [] as Array<{ stock?: number; min_stock?: number | null; is_active?: boolean }>),
  ]);

  let totalRevenue = 0;
  let totalTransactions = 0;
  for (const r of Array.isArray(salesList) ? salesList : []) {
    if (r.is_cancelled === true || String(r.is_cancelled).toLowerCase() === 'true') continue;
    if (!isCountableSaleStatus(r.status)) continue;
    if (!isSalesRevenueRow(r)) continue;
    const day = String(r.date || r.created_at || '').slice(0, 10);
    if (day !== today) continue;
    if (!matchesSessionStoreAllowNull(r.store_id)) continue;
    const rFirm = String(r.firm_nr ?? '').trim();
    if (rFirm && !firmCandidates.includes(rFirm) && !firmCandidates.includes(rFirm.padStart(3, '0'))) {
      continue;
    }
    const sign = salesRevenueSign(r);
    const net = Math.abs(Number(r.net_amount ?? r.total_net ?? r.total_gross ?? 0) || 0);
    totalRevenue += sign * net;
    totalTransactions += 1;
  }

  const stores = Array.isArray(storeList) ? storeList : [];
  const totalStores = stores.length;
  const activeStores = stores.filter((x) => x?.is_active !== false).length;

  const productsRows = Array.isArray(productList) ? productList : [];
  const criticalAlerts = productsRows.filter(
    (p) =>
      p?.min_stock != null &&
      Number(p.stock ?? 0) < Number(p.min_stock) &&
      p?.is_active !== false,
  ).length;

  const avgBasket = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;
  return {
    totalRevenue,
    totalTransactions,
    avgBasket,
    activeStores,
    totalStores,
    criticalAlerts,
  };
}

async function fetchDashboardStatsViaBridge(): Promise<DashboardStats> {
  const fn = firmNr();
  const pn = periodNr();
  const rawFn = String(useAuthStore.getState().user?.firmNr ?? fn).trim();
  const sales = salesTable(fn, pn);
  const products = productsTable(fn);

  const salesConds = [
    'COALESCE(is_cancelled, false) = false',
    SQL_COUNTABLE_SALE,
    'COALESCE(date::date, created_at::date) = CURRENT_DATE',
    firmMatchSql('firm_nr', '$1', '$2'),
    `(LOWER(TRIM(COALESCE(fiche_type, ''))) IN (
        'sales_invoice', 'sales', 'retail', 'service', 'hizmet', 'return_invoice'
      ) OR COALESCE(trcode, 0) IN (0, 2, 3, 7, 8, 9, 14)
      OR (fiche_type IS NULL AND COALESCE(trcode, 0) NOT IN (1, 4, 5, 6, 13, 26, 41, 42)))`,
  ];
  const salesParams: unknown[] = [rawFn, fn];
  const storeSql = appendStoreIdFilterAllowNull('store_id', salesParams);
  if (storeSql) salesConds.push(storeSql.replace(/^\s*AND\s+/i, ''));

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
}

/**
 * Web `dashboardAPI.getStats()` ile aynı metrikler.
 * apiMode postgrest|hybrid → PostgREST aggregate; hybrid/bridge → SQL.
 */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  try {
    return await runDataTransport({
      label: 'fetchDashboardStats',
      viaRest: fetchDashboardStatsViaRest,
      viaBridge: fetchDashboardStatsViaBridge,
    });
  } catch (e) {
    rethrowTransportInfra(e, 'fetchDashboardStats');
    const msg = e instanceof Error ? e.message : String(e || 'Dashboard veri hatası');
    throw new Error(
      `${msg} [dashboard · firma=${firmNr()} dönem=${periodNr()}${storeId() ? ` mağaza=${storeId()}` : ''}]`,
    );
  }
}

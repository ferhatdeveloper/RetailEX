import { postgres, ERP_SETTINGS } from './postgres';

export interface Store {
  id: string;
  code: string;
  name: string;
  region: string;
  subRegion: string;
  city: string;
  district: string;
  manager: string;
  phone: string;
  status: 'active' | 'inactive' | 'maintenance';
  openingDate: string;
  size: number;
  employeeCount: number;
  isMain: boolean;
  scaleBridgeUrl?: string;
  scaleBridgeToken?: string;
}

export interface StoreStats {
  storeId: string;
  date: string;
  revenue: number;
  transactionCount: number;
  customerCount: number;
  avgBasket: number;
  cashBalance: number;
  stockValue: number;
}

export interface StoreAlert {
  id: string;
  storeId: string;
  storeName: string;
  type: 'critical' | 'warning' | 'info';
  category: 'stock' | 'cash' | 'system' | 'personnel';
  message: string;
  timestamp: string;
  resolved: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface SearchFilters {
  query?: string;
  region?: string;
  subRegion?: string;
  status?: string;
  /** UI ciro bandı seçimi (örn. 100k+); API katmanında min/max’e çevrilebilir */
  revenue?: string;
  minRevenue?: number;
  maxRevenue?: number;
}

export interface AggregatedStats {
  totalRevenue: number;
  totalTransactions: number;
  avgBasket: number;
  activeStores: number;
  totalStores: number;
  calculatedAt: string;
}

export interface RegionStats {
  regionId: string;
  regionName: string;
  storeCount: number;
  revenue: number;
  transactions: number;
  avgBasket: number;
  managerName: string;
  managerPhone: string;
  staffCount: number;
  /** Önceki döneme göre büyüme %; veri yoksa null */
  growth: number | null;
}

export interface StorePanelCard {
  id: string;
  code: string;
  name: string;
  location: string;
  manager: string;
  status: 'open' | 'closed';
  dailyRevenue: number;
  staffCount: number;
  phone: string;
}

export interface StorePanelDashboard {
  stores: StorePanelCard[];
  totalDailyRevenue: number;
  activeStores: number;
  totalStores: number;
  totalStaff: number;
  criticalStockCount: number;
  weeklyRevenue: Array<{ name: string; revenue: number }>;
}

export interface StoreAnalyticsBundle {
  days: number;
  totalRevenue: number;
  totalTransactions: number;
  avgBasket: number;
  activeCustomers: number;
  revenueGrowth: number | null;
  transactionsGrowth: number | null;
  avgBasketGrowth: number | null;
  customersGrowth: number | null;
  dailyTrend: Array<{ day: string; revenue: number; transactions: number }>;
  storePerformance: Array<{
    id: string;
    name: string;
    revenue: number;
    transactions: number;
    growth: number | null;
  }>;
  hourlySales: Array<{ hour: string; sales: number }>;
  categoryData: Array<{ name: string; value: number; percentage: number }>;
  topProducts: Array<{
    name: string;
    totalSales: number;
    storeCount: number;
    avgPrice: number;
  }>;
}

const WEEKDAY_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

/** Satış satırları: iptal edilmemiş */
const SALE_OK = `COALESCE(sa.is_cancelled, false) = false AND COALESCE(sa.status, 'completed') NOT IN ('cancelled', 'void')`;

function mapStoreRow(dbStore: any, employeeCount = 0): Store {
  return {
    id: dbStore.id,
    code: dbStore.code || '',
    name: dbStore.name || '',
    region: dbStore.region || '',
    subRegion: dbStore.city || '',
    city: dbStore.city || '',
    district: dbStore.address || '',
    manager: dbStore.manager_name || '',
    phone: dbStore.phone || '',
    status: dbStore.is_active ? 'active' : 'inactive',
    openingDate: dbStore.created_at,
    size: 0,
    employeeCount,
    isMain: Boolean(dbStore.is_main),
    scaleBridgeUrl: dbStore.scale_bridge_url || undefined,
    scaleBridgeToken: dbStore.scale_bridge_token || undefined,
  };
}

function pctGrowth(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) {
    return current > 0 ? 100 : null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function localDateIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localDateIso(d);
}

class StoreApiService {
  /**
   * Fetch stores with cursor-based pagination
   */
  async fetchStores(
    cursor: number = 0,
    limit: number = 50,
    filters?: SearchFilters,
  ): Promise<PaginatedResponse<Store>> {
    try {
      let sql = `SELECT *, count(*) OVER() as full_count FROM stores WHERE firm_nr = $1`;
      const params: any[] = [ERP_SETTINGS.firmNr];
      let paramIdx = 2;

      if (filters?.query) {
        sql += ` AND (name ILIKE $${paramIdx} OR code ILIKE $${paramIdx})`;
        params.push(`%${filters.query}%`);
        paramIdx++;
      }

      if (filters?.region) {
        sql += ` AND region = $${paramIdx}`;
        params.push(filters.region);
        paramIdx++;
      }

      if (filters?.status) {
        sql += ` AND is_active = $${paramIdx}`;
        params.push(filters.status === 'active');
        paramIdx++;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      params.push(limit, cursor);

      const { rows } = await postgres.query(sql, params);
      const totalStores = rows.length > 0 ? parseInt(rows[0].full_count, 10) : 0;
      const stores: Store[] = rows.map((dbStore: any) => mapStoreRow(dbStore));
      const nextCursor = cursor + limit < totalStores ? cursor + limit : null;

      return {
        data: stores,
        pagination: {
          cursor: nextCursor !== null ? String(nextCursor) : null,
          hasMore: nextCursor !== null,
          total: totalStores,
          page: Math.floor(cursor / limit) + 1,
          pageSize: limit,
        },
      };
    } catch (error) {
      console.error('Error fetching stores:', error);
      return {
        data: [],
        pagination: { cursor: null, hasMore: false, total: 0, page: 1, pageSize: limit },
      };
    }
  }

  async searchStores(
    query: string,
    filters?: SearchFilters,
    limit: number = 50,
  ): Promise<PaginatedResponse<Store>> {
    return this.fetchStores(0, limit, { ...filters, query });
  }

  async getAggregatedStats(_filters?: SearchFilters): Promise<AggregatedStats> {
    try {
      const { rows: storeStats } = await postgres.query(
        `SELECT
            count(*) as total_stores,
            sum(case when is_active = true then 1 else 0 end) as active_stores
         FROM stores WHERE firm_nr = $1`,
        [ERP_SETTINGS.firmNr],
      );

      const { rows: salesStats } = await postgres.query(
        `SELECT
            coalesce(sum(sa.total_gross), 0) as total_revenue,
            count(*) as total_transactions
         FROM sales sa
         WHERE ${SALE_OK}`,
      );

      const totalRevenue = parseFloat(salesStats[0]?.total_revenue || '0');
      const totalTransactions = parseInt(salesStats[0]?.total_transactions || '0', 10);
      const avgBasket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

      return {
        totalRevenue,
        totalTransactions,
        avgBasket,
        activeStores: parseInt(storeStats[0]?.active_stores || '0', 10),
        totalStores: parseInt(storeStats[0]?.total_stores || '0', 10),
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting aggregated stats:', error);
      return {
        totalRevenue: 0,
        totalTransactions: 0,
        avgBasket: 0,
        activeStores: 0,
        totalStores: 0,
        calculatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Mağaza Paneli — PG stores + bugünkü satış + personel + kritik stok + haftalık ciro
   */
  async getStorePanelDashboard(): Promise<StorePanelDashboard> {
    const empty: StorePanelDashboard = {
      stores: [],
      totalDailyRevenue: 0,
      activeStores: 0,
      totalStores: 0,
      totalStaff: 0,
      criticalStockCount: 0,
      weeklyRevenue: [],
    };

    try {
      const today = localDateIso();
      const weekStart = addDaysIso(today, -6);

      const [{ rows: storeRows }, { rows: staffRows }, { rows: critRows }, { rows: dailyRows }, { rows: weekRows }] =
        await Promise.all([
          postgres.query(
            `SELECT id, code, name, city, region, address, phone, manager_name, is_active, is_main
             FROM stores
             WHERE firm_nr = $1
             ORDER BY COALESCE(is_main, false) DESC, name ASC`,
            [ERP_SETTINGS.firmNr],
          ),
          postgres.query(
            `SELECT store_id::text AS store_id, count(*)::int AS staff_count
             FROM users
             WHERE firm_nr = $1
               AND store_id IS NOT NULL
               AND COALESCE(is_active, true) = true
             GROUP BY store_id`,
            [ERP_SETTINGS.firmNr],
          ).catch(() => ({ rows: [] as any[] })),
          postgres.query(
            `SELECT count(*)::int AS cnt
             FROM products p
             WHERE COALESCE(p.is_active, true) = true
               AND (
                 (COALESCE(p.critical_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.critical_stock)
                 OR (COALESCE(p.min_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.min_stock)
               )`,
          ).catch(() => ({ rows: [{ cnt: 0 }] })),
          postgres.query(
            `SELECT sa.store_id::text AS store_id,
                    coalesce(sum(sa.total_gross), 0) AS revenue
             FROM sales sa
             WHERE ${SALE_OK}
               AND sa.date::date = $1::date
             GROUP BY sa.store_id`,
            [today],
          ).catch(() => ({ rows: [] as any[] })),
          postgres.query(
            `SELECT sa.date::date AS d,
                    coalesce(sum(sa.total_gross), 0) AS revenue
             FROM sales sa
             WHERE ${SALE_OK}
               AND sa.date::date >= $1::date
               AND sa.date::date <= $2::date
             GROUP BY sa.date::date
             ORDER BY d`,
            [weekStart, today],
          ).catch(() => ({ rows: [] as any[] })),
        ]);

      const staffByStore = new Map<string, number>();
      for (const r of staffRows || []) {
        staffByStore.set(String(r.store_id), parseInt(r.staff_count, 10) || 0);
      }
      const revenueByStore = new Map<string, number>();
      for (const r of dailyRows || []) {
        if (r.store_id) revenueByStore.set(String(r.store_id), parseFloat(r.revenue || '0'));
      }

      const stores: StorePanelCard[] = (storeRows || []).map((s: any) => {
        const city = String(s.city || '').trim();
        const region = String(s.region || '').trim();
        const location = [city, region].filter(Boolean).join(', ') || String(s.address || '').trim();
        return {
          id: String(s.id),
          code: String(s.code || ''),
          name: String(s.name || ''),
          location,
          manager: String(s.manager_name || '').trim(),
          status: s.is_active ? 'open' : 'closed',
          dailyRevenue: revenueByStore.get(String(s.id)) || 0,
          staffCount: staffByStore.get(String(s.id)) || 0,
          phone: String(s.phone || '').trim(),
        };
      });

      const weekMap = new Map<string, number>();
      for (const r of weekRows || []) {
        const key = String(r.d).slice(0, 10);
        weekMap.set(key, parseFloat(r.revenue || '0'));
      }
      const weeklyRevenue: Array<{ name: string; revenue: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const iso = addDaysIso(today, -i);
        const d = new Date(`${iso}T12:00:00`);
        weeklyRevenue.push({
          name: WEEKDAY_TR[d.getDay()],
          revenue: weekMap.get(iso) || 0,
        });
      }

      const totalDailyRevenue = stores.reduce((a, s) => a + s.dailyRevenue, 0);
      const totalStaff = stores.reduce((a, s) => a + s.staffCount, 0);
      const activeStores = stores.filter((s) => s.status === 'open').length;

      return {
        stores,
        totalDailyRevenue,
        activeStores,
        totalStores: stores.length,
        totalStaff,
        criticalStockCount: parseInt(critRows?.[0]?.cnt || '0', 10) || 0,
        weeklyRevenue,
      };
    } catch (error) {
      console.error('[storeApi] getStorePanelDashboard failed:', error);
      return empty;
    }
  }

  /**
   * Çoklu mağaza detaylı analitik — gerçek satış / kalem verisi
   */
  async getStoreAnalytics(days: number = 30): Promise<StoreAnalyticsBundle> {
    const safeDays = Math.min(Math.max(Math.floor(days) || 30, 1), 366);
    const empty: StoreAnalyticsBundle = {
      days: safeDays,
      totalRevenue: 0,
      totalTransactions: 0,
      avgBasket: 0,
      activeCustomers: 0,
      revenueGrowth: null,
      transactionsGrowth: null,
      avgBasketGrowth: null,
      customersGrowth: null,
      dailyTrend: [],
      storePerformance: [],
      hourlySales: Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, sales: 0 })),
      categoryData: [],
      topProducts: [],
    };

    try {
      const today = localDateIso();
      const rangeStart = addDaysIso(today, -(safeDays - 1));
      const prevEnd = addDaysIso(rangeStart, -1);
      const prevStart = addDaysIso(prevEnd, -(safeDays - 1));

      const [
        { rows: curAgg },
        { rows: prevAgg },
        { rows: dailyRows },
        { rows: storeRows },
        { rows: prevStoreRows },
        { rows: hourlyRows },
        { rows: catRows },
        { rows: productRows },
      ] = await Promise.all([
        postgres.query(
          `SELECT
              coalesce(sum(sa.total_gross), 0) AS revenue,
              count(*)::int AS tx,
              count(DISTINCT sa.customer_id)::int AS customers
           FROM sales sa
           WHERE ${SALE_OK}
             AND sa.date::date >= $1::date AND sa.date::date <= $2::date`,
          [rangeStart, today],
        ),
        postgres.query(
          `SELECT
              coalesce(sum(sa.total_gross), 0) AS revenue,
              count(*)::int AS tx,
              count(DISTINCT sa.customer_id)::int AS customers
           FROM sales sa
           WHERE ${SALE_OK}
             AND sa.date::date >= $1::date AND sa.date::date <= $2::date`,
          [prevStart, prevEnd],
        ),
        postgres.query(
          `SELECT sa.date::date AS d,
                  coalesce(sum(sa.total_gross), 0) AS revenue,
                  count(*)::int AS tx
           FROM sales sa
           WHERE ${SALE_OK}
             AND sa.date::date >= $1::date AND sa.date::date <= $2::date
           GROUP BY sa.date::date
           ORDER BY d`,
          [rangeStart, today],
        ),
        postgres.query(
          `SELECT s.id::text AS id, s.name,
                  coalesce(sum(sa.total_gross), 0) AS revenue,
                  count(sa.id)::int AS tx
           FROM stores s
           LEFT JOIN sales sa ON sa.store_id = s.id
             AND ${SALE_OK}
             AND sa.date::date >= $2::date AND sa.date::date <= $3::date
           WHERE s.firm_nr = $1
           GROUP BY s.id, s.name
           ORDER BY revenue DESC`,
          [ERP_SETTINGS.firmNr, rangeStart, today],
        ),
        postgres.query(
          `SELECT sa.store_id::text AS id,
                  coalesce(sum(sa.total_gross), 0) AS revenue
           FROM sales sa
           WHERE ${SALE_OK}
             AND sa.date::date >= $1::date AND sa.date::date <= $2::date
             AND sa.store_id IS NOT NULL
           GROUP BY sa.store_id`,
          [prevStart, prevEnd],
        ),
        postgres.query(
          `SELECT EXTRACT(HOUR FROM sa.date)::int AS h,
                  coalesce(sum(sa.total_gross), 0) AS sales
           FROM sales sa
           WHERE ${SALE_OK}
             AND sa.date::date >= $1::date AND sa.date::date <= $2::date
           GROUP BY EXTRACT(HOUR FROM sa.date)
           ORDER BY h`,
          [rangeStart, today],
        ),
        postgres.query(
          `SELECT
              coalesce(nullif(trim(p.group_code), ''), nullif(trim(p.category_code), ''), 'Diğer') AS cat,
              coalesce(sum(si.net_amount), 0) AS value
           FROM sale_items si
           INNER JOIN sales sa ON sa.id = si.invoice_id
           LEFT JOIN products p ON p.id = si.product_id
           WHERE ${SALE_OK}
             AND sa.date::date >= $1::date AND sa.date::date <= $2::date
             AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
           GROUP BY 1
           ORDER BY value DESC
           LIMIT 12`,
          [rangeStart, today],
        ).catch(() => ({ rows: [] as any[] })),
        postgres.query(
          `SELECT
              coalesce(nullif(trim(si.item_name), ''), 'Ürün') AS name,
              coalesce(sum(si.net_amount), 0) AS total_sales,
              count(DISTINCT sa.store_id)::int AS store_count,
              CASE WHEN sum(si.quantity) > 0
                   THEN sum(si.net_amount) / nullif(sum(si.quantity), 0)
                   ELSE 0 END AS avg_price
           FROM sale_items si
           INNER JOIN sales sa ON sa.id = si.invoice_id
           WHERE ${SALE_OK}
             AND sa.date::date >= $1::date AND sa.date::date <= $2::date
             AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
           GROUP BY 1
           ORDER BY total_sales DESC
           LIMIT 10`,
          [rangeStart, today],
        ).catch(() => ({ rows: [] as any[] })),
      ]);

      const totalRevenue = parseFloat(curAgg[0]?.revenue || '0');
      const totalTransactions = parseInt(curAgg[0]?.tx || '0', 10);
      const activeCustomers = parseInt(curAgg[0]?.customers || '0', 10);
      const avgBasket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

      const prevRevenue = parseFloat(prevAgg[0]?.revenue || '0');
      const prevTx = parseInt(prevAgg[0]?.tx || '0', 10);
      const prevCustomers = parseInt(prevAgg[0]?.customers || '0', 10);
      const prevAvg = prevTx > 0 ? prevRevenue / prevTx : 0;

      const dayMap = new Map<string, { revenue: number; transactions: number }>();
      for (const r of dailyRows || []) {
        dayMap.set(String(r.d).slice(0, 10), {
          revenue: parseFloat(r.revenue || '0'),
          transactions: parseInt(r.tx || '0', 10),
        });
      }
      const dailyTrend: StoreAnalyticsBundle['dailyTrend'] = [];
      for (let i = safeDays - 1; i >= 0; i--) {
        const iso = addDaysIso(today, -i);
        const hit = dayMap.get(iso);
        dailyTrend.push({
          day: String(Number(iso.slice(8, 10))),
          revenue: hit?.revenue || 0,
          transactions: hit?.transactions || 0,
        });
      }

      const prevByStore = new Map<string, number>();
      for (const r of prevStoreRows || []) {
        prevByStore.set(String(r.id), parseFloat(r.revenue || '0'));
      }
      const storePerformance = (storeRows || []).map((r: any) => {
        const revenue = parseFloat(r.revenue || '0');
        const transactions = parseInt(r.tx || '0', 10);
        const prev = prevByStore.get(String(r.id)) || 0;
        return {
          id: String(r.id),
          name: String(r.name || ''),
          revenue,
          transactions,
          growth: pctGrowth(revenue, prev),
        };
      });

      const hourMap = new Map<number, number>();
      for (const r of hourlyRows || []) {
        hourMap.set(parseInt(r.h, 10), parseFloat(r.sales || '0'));
      }
      const hourlySales = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}:00`,
        sales: hourMap.get(i) || 0,
      }));

      const catTotal = (catRows || []).reduce((a: number, r: any) => a + parseFloat(r.value || '0'), 0);
      const categoryData = (catRows || []).map((r: any) => {
        const value = parseFloat(r.value || '0');
        return {
          name: String(r.cat || 'Diğer'),
          value,
          percentage: catTotal > 0 ? Math.round((value / catTotal) * 1000) / 10 : 0,
        };
      });

      const topProducts = (productRows || []).map((r: any) => ({
        name: String(r.name || ''),
        totalSales: parseFloat(r.total_sales || '0'),
        storeCount: parseInt(r.store_count || '0', 10),
        avgPrice: parseFloat(r.avg_price || '0'),
      }));

      return {
        days: safeDays,
        totalRevenue,
        totalTransactions,
        avgBasket,
        activeCustomers,
        revenueGrowth: pctGrowth(totalRevenue, prevRevenue),
        transactionsGrowth: pctGrowth(totalTransactions, prevTx),
        avgBasketGrowth: pctGrowth(avgBasket, prevAvg),
        customersGrowth: pctGrowth(activeCustomers, prevCustomers),
        dailyTrend,
        storePerformance,
        hourlySales,
        categoryData,
        topProducts,
      };
    } catch (error) {
      console.error('[storeApi] getStoreAnalytics failed:', error);
      return empty;
    }
  }

  async getRegionStats(): Promise<RegionStats[]> {
    try {
      const today = localDateIso();
      const curStart = addDaysIso(today, -29);
      const prevEnd = addDaysIso(curStart, -1);
      const prevStart = addDaysIso(prevEnd, -29);

      const { rows } = await postgres.query(
        `WITH region_base AS (
           SELECT
             coalesce(nullif(trim(s.region), ''), coalesce(nullif(trim(s.city), ''), '—')) AS region_name,
             s.id AS store_id,
             s.manager_name,
             s.phone
           FROM stores s
           WHERE s.firm_nr = $1
         ),
         cur AS (
           SELECT rb.region_name,
                  coalesce(sum(sa.total_gross), 0) AS revenue,
                  count(sa.id)::int AS transactions
           FROM region_base rb
           LEFT JOIN sales sa ON sa.store_id = rb.store_id
             AND ${SALE_OK}
             AND sa.date::date >= $2::date AND sa.date::date <= $3::date
           GROUP BY rb.region_name
         ),
         prev AS (
           SELECT rb.region_name,
                  coalesce(sum(sa.total_gross), 0) AS revenue
           FROM region_base rb
           LEFT JOIN sales sa ON sa.store_id = rb.store_id
             AND ${SALE_OK}
             AND sa.date::date >= $4::date AND sa.date::date <= $5::date
           GROUP BY rb.region_name
         ),
         mgr AS (
           SELECT DISTINCT ON (region_name)
             region_name,
             coalesce(nullif(trim(manager_name), ''), '') AS manager_name,
             coalesce(nullif(trim(phone), ''), '') AS phone
           FROM region_base
           ORDER BY region_name,
                    CASE WHEN nullif(trim(manager_name), '') IS NOT NULL THEN 0 ELSE 1 END,
                    store_id
         ),
         staff AS (
           SELECT rb.region_name, count(u.id)::int AS staff_count
           FROM region_base rb
           LEFT JOIN users u ON u.store_id = rb.store_id AND COALESCE(u.is_active, true) = true
           GROUP BY rb.region_name
         ),
         counts AS (
           SELECT region_name, count(*)::int AS store_count
           FROM region_base
           GROUP BY region_name
         )
         SELECT c.region_name,
                cnt.store_count,
                coalesce(cur.revenue, 0) AS revenue,
                coalesce(cur.transactions, 0) AS transactions,
                coalesce(prev.revenue, 0) AS prev_revenue,
                mgr.manager_name,
                mgr.phone AS manager_phone,
                coalesce(staff.staff_count, 0) AS staff_count
         FROM counts cnt
         JOIN (SELECT DISTINCT region_name FROM region_base) c ON c.region_name = cnt.region_name
         LEFT JOIN cur ON cur.region_name = c.region_name
         LEFT JOIN prev ON prev.region_name = c.region_name
         LEFT JOIN mgr ON mgr.region_name = c.region_name
         LEFT JOIN staff ON staff.region_name = c.region_name
         ORDER BY coalesce(cur.revenue, 0) DESC, c.region_name`,
        [ERP_SETTINGS.firmNr, curStart, today, prevStart, prevEnd],
      );

      return (rows || []).map((r: any) => {
        const revenue = parseFloat(r.revenue || '0');
        const transactions = parseInt(r.transactions || '0', 10);
        const prevRevenue = parseFloat(r.prev_revenue || '0');
        const regionName = String(r.region_name || '—');
        return {
          regionId: regionName.toLowerCase().replace(/\s+/g, '-'),
          regionName,
          storeCount: parseInt(r.store_count || '0', 10),
          revenue,
          transactions,
          avgBasket: transactions > 0 ? revenue / transactions : 0,
          managerName: String(r.manager_name || ''),
          managerPhone: String(r.manager_phone || ''),
          staffCount: parseInt(r.staff_count || '0', 10),
          growth: pctGrowth(revenue, prevRevenue),
        };
      });
    } catch (error) {
      console.error('Error getting region stats:', error);
      return [];
    }
  }

  async getTopStores(limit: number = 10): Promise<Array<Store & { stats: StoreStats }>> {
    try {
      const { rows } = await postgres.query(
        `SELECT
            s.*,
            coalesce(sum(sa.total_gross), 0) as revenue,
            count(sa.id) as transactions,
            count(DISTINCT sa.customer_id) as customers
         FROM stores s
         LEFT JOIN sales sa ON s.id = sa.store_id AND ${SALE_OK}
         WHERE s.firm_nr = $1
         GROUP BY s.id
         ORDER BY revenue DESC
         LIMIT $2`,
        [ERP_SETTINGS.firmNr, limit],
      );

      return rows.map((dbStore: any) => {
        const revenue = parseFloat(dbStore.revenue);
        const transactions = parseInt(dbStore.transactions, 10);
        const customers = parseInt(dbStore.customers || '0', 10);
        return {
          ...mapStoreRow(dbStore),
          stats: {
            storeId: dbStore.id,
            date: localDateIso(),
            revenue,
            transactionCount: transactions,
            customerCount: customers,
            avgBasket: transactions > 0 ? revenue / transactions : 0,
            cashBalance: 0,
            stockValue: 0,
          },
        };
      });
    } catch (error) {
      console.error('Error getting top stores:', error);
      return [];
    }
  }

  async getCriticalAlerts(_limit: number = 50): Promise<StoreAlert[]> {
    return [];
  }

  async getStoreStats(storeId: string): Promise<StoreStats> {
    try {
      const { rows } = await postgres.query(
        `SELECT
            coalesce(sum(total_gross), 0) as total_revenue,
            count(*) as total_transactions,
            count(DISTINCT customer_id) as customers
         FROM sales sa
         WHERE store_id = $1 AND ${SALE_OK}`,
        [storeId],
      );

      const revenue = parseFloat(rows[0]?.total_revenue || '0');
      const transactions = parseInt(rows[0]?.total_transactions || '0', 10);
      const customers = parseInt(rows[0]?.customers || '0', 10);

      return {
        storeId,
        date: localDateIso(),
        revenue,
        transactionCount: transactions,
        customerCount: customers,
        avgBasket: transactions > 0 ? revenue / transactions : 0,
        cashBalance: 0,
        stockValue: 0,
      };
    } catch (error) {
      console.error('Error getting store stats:', error);
      return {
        storeId,
        date: localDateIso(),
        revenue: 0,
        transactionCount: 0,
        customerCount: 0,
        avgBasket: 0,
        cashBalance: 0,
        stockValue: 0,
      };
    }
  }

  async createStore(store: Partial<Store>): Promise<Store> {
    try {
      const { rows } = await postgres.query(
        `INSERT INTO stores (
            code, name, region, city, address, phone, is_active, is_main, firm_nr, manager_name
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          store.code,
          store.name,
          store.region,
          store.city,
          store.district,
          store.phone,
          store.status === 'active',
          store.isMain || false,
          ERP_SETTINGS.firmNr,
          store.manager,
        ],
      );
      return mapStoreRow(rows[0]);
    } catch (error) {
      console.error('Error creating store:', error);
      throw error;
    }
  }

  async updateStore(id: string, updates: Partial<Store>): Promise<Store> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      if (updates.code) {
        fields.push(`code = $${i++}`);
        values.push(updates.code);
      }
      if (updates.name) {
        fields.push(`name = $${i++}`);
        values.push(updates.name);
      }
      if (updates.region) {
        fields.push(`region = $${i++}`);
        values.push(updates.region);
      }
      if (updates.city) {
        fields.push(`city = $${i++}`);
        values.push(updates.city);
      }
      if (updates.district) {
        fields.push(`address = $${i++}`);
        values.push(updates.district);
      }
      if (updates.phone) {
        fields.push(`phone = $${i++}`);
        values.push(updates.phone);
      }
      if (updates.status) {
        fields.push(`is_active = $${i++}`);
        values.push(updates.status === 'active');
      }
      if (updates.isMain !== undefined) {
        fields.push(`is_main = $${i++}`);
        values.push(updates.isMain);
      }
      if (updates.manager) {
        fields.push(`manager_name = $${i++}`);
        values.push(updates.manager);
      }
      if (updates.scaleBridgeUrl !== undefined) {
        fields.push(`scale_bridge_url = $${i++}`);
        values.push(updates.scaleBridgeUrl || null);
      }
      if (updates.scaleBridgeToken !== undefined) {
        fields.push(`scale_bridge_token = $${i++}`);
        values.push(updates.scaleBridgeToken || null);
      }

      if (fields.length === 0) throw new Error('No updates provided');

      values.push(id);
      const { rows } = await postgres.query(
        `UPDATE stores SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values,
      );
      return mapStoreRow(rows[0]);
    } catch (error) {
      console.error('Error updating store:', error);
      throw error;
    }
  }

  async deleteStore(id: string): Promise<void> {
    try {
      await postgres.query(`DELETE FROM stores WHERE id = $1`, [id]);
    } catch (error) {
      console.error('Error deleting store:', error);
      throw error;
    }
  }

  async getRegions() {
    try {
      const { rows } = await postgres.query(
        `SELECT DISTINCT region FROM stores WHERE firm_nr = $1 AND region IS NOT NULL AND trim(region) <> ''`,
        [ERP_SETTINGS.firmNr],
      );
      return rows.map((r) => ({ id: r.region, name: r.region, subRegions: [] }));
    } catch (error) {
      console.error('Error getting regions:', error);
      return [];
    }
  }
}

export const storeApiService = new StoreApiService();

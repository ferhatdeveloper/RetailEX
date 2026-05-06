/**
 * Dashboard API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';

function padFirmNr(): string {
    return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}
function padPeriodNr(): string {
    return String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
}

export interface DashboardStats {
    totalRevenue: number;
    totalTransactions: number;
    avgBasket: number;
    activeStores: number;
    totalStores: number;
    criticalAlerts: number;
}

export interface DashboardStore {
    id: string;
    name: string;
    code: string;
    region: string;
    district: string;
    manager: string;
    revenue: number;
    transactionCount: number;
    avgBasket: number;
    cashBalance: number;
    status: 'active' | 'inactive' | 'maintenance';
}

export interface DashboardAlert {
    id: string;
    storeName: string;
    message: string;
    timestamp: string;
    severity: 'critical' | 'warning' | 'info';
}

export const dashboardAPI = {
    /**
     * Get aggregated statistics for dashboard
     */
    async getStats(): Promise<DashboardStats> {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const t0 = today.toISOString();
            const t1 = tomorrow.toISOString();

            let totalRevenue = 0;
            let totalTransactions = 0;
            let totalStores = 0;
            let activeStores = 0;
            let criticalAlerts = 0;

            if (DB_SETTINGS.connectionProvider === 'rest_api') {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const pn = padPeriodNr();
                const salesPath = `/rex_${fn}_${pn}_sales`;
                const salesList = await postgrest
                    .get<any[]>(
                        salesPath,
                        {
                            select: 'net_amount,created_at',
                            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
                            created_at: `gte.${t0}`,
                        },
                        { schema: 'public' }
                    )
                    .catch(() => [] as any[]);
                const slRaw = Array.isArray(salesList) ? salesList : [];
                const t1ms = tomorrow.getTime();
                const sl = slRaw.filter((r) => {
                    const t = new Date(String(r?.created_at || '')).getTime();
                    return !Number.isNaN(t) && t < t1ms;
                });
                totalTransactions = sl.length;
                totalRevenue = sl.reduce((s, r) => s + parseFloat(String(r?.net_amount ?? 0)), 0);

                const storeList = await postgrest
                    .get<any[]>(`/stores`, { select: 'id,is_active' }, { schema: 'public' })
                    .catch(() => [] as any[]);
                const st = Array.isArray(storeList) ? storeList : [];
                totalStores = st.length;
                activeStores = st.filter((x) => x?.is_active !== false).length;

                const prodPath = `/rex_${fn}_products`;
                const products = await postgrest
                    .get<any[]>(
                        prodPath,
                        {
                            select: 'stock,min_stock',
                            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
                            is_active: 'eq.true',
                            limit: 2000,
                        },
                        { schema: 'public' }
                    )
                    .catch(() => [] as any[]);
                const pr = Array.isArray(products) ? products : [];
                criticalAlerts = pr.filter(
                    (p) =>
                        p?.min_stock != null &&
                        Number(p.stock) < Number(p.min_stock)
                ).length;
            } else {
                const { rows: salesRows } = await postgres.query(
                    `SELECT 
                    COALESCE(SUM(COALESCE(net_amount, total_net, total_gross, 0)), 0)::numeric AS revenue, 
                    COUNT(*)::int AS count 
                 FROM sales 
                 WHERE created_at >= $1 AND created_at < $2 AND firm_nr = $3`,
                    [t0, t1, ERP_SETTINGS.firmNr]
                );

                totalRevenue = parseFloat(String(salesRows[0]?.revenue ?? 0));
                totalTransactions = parseInt(String(salesRows[0]?.count ?? 0), 10);

                const { rows: storesRows } = await postgres.query(
                    `SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_active = true) as active
                 FROM stores`
                );

                totalStores = parseInt(storesRows[0]?.total || 0);
                activeStores = parseInt(storesRows[0]?.active || 0);

                const { rows: alertRows } = await postgres.query(
                    `SELECT COUNT(*) as count 
                 FROM products 
                 WHERE min_stock IS NOT NULL AND stock < min_stock AND firm_nr = $1 AND is_active = true`,
                    [ERP_SETTINGS.firmNr]
                );

                criticalAlerts = parseInt(alertRows[0]?.count || 0);
            }

            const avgBasket = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

            return {
                totalRevenue,
                totalTransactions,
                avgBasket,
                activeStores,
                totalStores,
                criticalAlerts
            };
        } catch (error) {
            console.error('[DashboardAPI] getStats failed:', error);
            return {
                totalRevenue: 0,
                totalTransactions: 0,
                avgBasket: 0,
                activeStores: 0,
                totalStores: 0,
                criticalAlerts: 0
            };
        }
    },

    /**
     * Get list of all stores with their today's metrics
     */
    async getStoreList(): Promise<DashboardStore[]> {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const t0 = today.toISOString();

            let stores: any[] = [];
            const salesMap = new Map<string, { revenue: number; count: number }>();

            if (DB_SETTINGS.connectionProvider === 'rest_api') {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const pn = padPeriodNr();
                const salesPath = `/rex_${fn}_${pn}_sales`;
                const fetchedStores = await postgrest
                    .get<any[]>(`/stores`, { select: '*', order: 'name.asc' }, { schema: 'public' })
                    .catch(() => [] as any[]);
                stores = Array.isArray(fetchedStores) ? fetchedStores : [];
                const salesList = await postgrest
                    .get<any[]>(
                        salesPath,
                        {
                            select: 'store_id,net_amount,created_at',
                            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
                            created_at: `gte.${t0}`,
                        },
                        { schema: 'public' }
                    )
                    .catch(() => [] as any[]);
                (Array.isArray(salesList) ? salesList : []).forEach((s) => {
                    const sid = s.store_id ? String(s.store_id) : '';
                    if (!sid) return;
                    const cur = salesMap.get(sid) || { revenue: 0, count: 0 };
                    cur.revenue += parseFloat(String(s.net_amount ?? 0));
                    cur.count += 1;
                    salesMap.set(sid, cur);
                });
            } else {
                const { rows } = await postgres.query(`SELECT * FROM stores ORDER BY name`);
                stores = rows;

                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const t1 = tomorrow.toISOString();
                const { rows: salesAgg } = await postgres.query(
                    `SELECT 
                    store_id, 
                    COALESCE(SUM(COALESCE(net_amount, total_net, total_gross, 0)), 0)::numeric AS revenue, 
                    COUNT(*)::int AS count 
                 FROM sales 
                 WHERE created_at >= $1 AND created_at < $2 AND firm_nr = $3
                 GROUP BY store_id`,
                    [t0, t1, ERP_SETTINGS.firmNr]
                );

                salesAgg.forEach((s: any) => {
                    if (s.store_id) salesMap.set(s.store_id, {
                        revenue: parseFloat(s.revenue),
                        count: parseInt(s.count)
                    });
                });
            }

            return stores.map(store => {
                const stats = salesMap.get(store.id) || { revenue: 0, count: 0 };
                return {
                    id: store.id,
                    name: store.name || 'Adsız Mağaza',
                    code: store.code || 'NO-CODE',
                    region: store.region || 'Bölge Belirtilmemiş',
                    district: store.district || '',
                    manager: store.manager || 'Yönetici Atanmamış',
                    revenue: stats.revenue,
                    transactionCount: stats.count,
                    avgBasket: stats.count > 0 ? Math.round(stats.revenue / stats.count) : 0,
                    cashBalance: Math.round(stats.revenue * 0.15),
                    status: store.is_active ? 'active' : 'inactive'
                };
            });
        } catch (error) {
            console.error('[DashboardAPI] getStoreList failed:', error);
            return [];
        }
    },

    /**
     * Get top performing stores
     */
    async getTopStores(limit: number = 5): Promise<DashboardStore[]> {
        const stores = await this.getStoreList();
        return stores
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, limit);
    },

    /**
     * Get critical alerts (low stock)
     */
    async getCriticalAlerts(limit: number = 10): Promise<DashboardAlert[]> {
        try {
            let lowStock: any[] = [];

            if (DB_SETTINGS.connectionProvider === 'rest_api') {
                const { postgrest } = await import('./postgrestClient');
                const fn = padFirmNr();
                const prodPath = `/rex_${fn}_products`;
                const products = await postgrest
                    .get<any[]>(
                        prodPath,
                        {
                            select: 'id,name,stock,min_stock,store_id',
                            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
                            is_active: 'eq.true',
                            limit: 500,
                        },
                        { schema: 'public' }
                    )
                    .catch(() => [] as any[]);
                const pr = Array.isArray(products) ? products : [];
                const candidates = pr
                    .filter(
                        (p) =>
                            p?.min_stock != null &&
                            Number(p.stock) < Number(p.min_stock)
                    )
                    .sort((a, b) => Number(a.stock) - Number(b.stock));
                const storeNames = new Map<string, string>();
                const stores = await postgrest
                    .get<any[]>(`/stores`, { select: 'id,name' }, { schema: 'public' })
                    .catch(() => [] as any[]);
                (Array.isArray(stores) ? stores : []).forEach((s) => storeNames.set(String(s.id), String(s.name || '')));
                lowStock = candidates.slice(0, limit).map((p) => ({
                    name: p.name,
                    stock: p.stock,
                    min_stock: p.min_stock,
                    store_name: p.store_id ? storeNames.get(String(p.store_id)) : null,
                }));
            } else {
                const { rows } = await postgres.query(
                    `SELECT p.name, p.stock, p.min_stock, s.name as store_name
                 FROM products p
                 LEFT JOIN stores s ON p.store_id = s.id
                 WHERE p.min_stock IS NOT NULL AND p.stock < p.min_stock 
                 AND p.firm_nr = $1 AND p.is_active = true
                 ORDER BY p.stock ASC
                 LIMIT $2`,
                    [ERP_SETTINGS.firmNr, limit]
                );
                lowStock = rows;
            }

            return lowStock.map((p, idx) => ({
                id: `alert-${idx}`,
                storeName: p.store_name || 'Ana Depo',
                message: `${p.name} ürünü kritik seviyede (${p.stock} adet kaldı, min: ${p.min_stock})`,
                timestamp: new Date().toISOString(),
                severity: 'critical'
            }));
        } catch (error) {
            console.error('[DashboardAPI] getCriticalAlerts failed:', error);
            return [];
        }
    }
};

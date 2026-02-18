/**
 * Dashboard API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';

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

            // 1. Sales stats (Revenue & Transactions)
            const { rows: salesRows } = await postgres.query(
                `SELECT 
                    SUM(total) as revenue, 
                    COUNT(*) as count 
                 FROM sales 
                 WHERE created_at >= $1 AND created_at < $2 AND firm_nr = $3`,
                [today.toISOString(), tomorrow.toISOString(), ERP_SETTINGS.firmNr]
            );

            const totalRevenue = parseFloat(salesRows[0]?.revenue || 0);
            const totalTransactions = parseInt(salesRows[0]?.count || 0);
            const avgBasket = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

            // 2. Store stats
            const { rows: storesRows } = await postgres.query(
                `SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_active = true) as active
                 FROM stores`
            );

            const totalStores = parseInt(storesRows[0]?.total || 0);
            const activeStores = parseInt(storesRows[0]?.active || 0);

            // 3. Stock alerts
            const { rows: alertRows } = await postgres.query(
                `SELECT COUNT(*) as count 
                 FROM products 
                 WHERE min_stock IS NOT NULL AND stock < min_stock AND firm_nr = $1 AND is_active = true`,
                [ERP_SETTINGS.firmNr]
            );

            const criticalAlerts = parseInt(alertRows[0]?.count || 0);

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

            // Get all stores and their today's sales in one join if possible
            // But since 'sales' is at a different granularity, a subquery or separate aggregation is safer
            const { rows: stores } = await postgres.query(`SELECT * FROM stores ORDER BY name`);

            const { rows: salesAgg } = await postgres.query(
                `SELECT 
                    store_id, 
                    SUM(total) as revenue, 
                    COUNT(*) as count 
                 FROM sales 
                 WHERE created_at >= $1 AND firm_nr = $2
                 GROUP BY store_id`,
                [today.toISOString(), ERP_SETTINGS.firmNr]
            );

            const salesMap = new Map<string, { revenue: number, count: number }>();
            salesAgg.forEach(s => {
                if (s.store_id) salesMap.set(s.store_id, {
                    revenue: parseFloat(s.revenue),
                    count: parseInt(s.count)
                });
            });

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
            const { rows: lowStock } = await postgres.query(
                `SELECT p.name, p.stock, p.min_stock, s.name as store_name
                 FROM products p
                 LEFT JOIN stores s ON p.store_id = s.id
                 WHERE p.min_stock IS NOT NULL AND p.stock < p.min_stock 
                 AND p.firm_nr = $1 AND p.is_active = true
                 ORDER BY p.stock ASC
                 LIMIT $2`,
                [ERP_SETTINGS.firmNr, limit]
            );

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

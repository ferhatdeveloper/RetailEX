import { postgres, ERP_SETTINGS } from './postgres';
import { supabase } from '../utils/supabase/client'; // Keeping for backward compatibility or global tables if needed

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
}

class StoreApiService {

  /**
   * Fetch stores with cursor-based pagination
   */
  async fetchStores(
    cursor: number = 0,
    limit: number = 50,
    filters?: SearchFilters
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

      const totalStores = rows.length > 0 ? parseInt(rows[0].full_count) : 0;

      const stores: Store[] = rows.map((dbStore: any) => ({
        id: dbStore.id,
        code: dbStore.code,
        name: dbStore.name,
        region: dbStore.region || 'Bilinmiyor',
        subRegion: dbStore.city || '',
        city: dbStore.city || '',
        district: dbStore.address || '',
        manager: dbStore.manager_name || 'Atanmadı',
        phone: dbStore.phone || '',
        status: dbStore.is_active ? 'active' : 'inactive',
        openingDate: dbStore.created_at,
        size: 0,
        employeeCount: 0,
        isMain: dbStore.is_main
      }));

      const nextCursor = cursor + limit < totalStores ? cursor + limit : null;

      return {
        data: stores,
        pagination: {
          cursor: nextCursor !== null ? String(nextCursor) : null,
          hasMore: nextCursor !== null,
          total: totalStores,
          page: Math.floor(cursor / limit) + 1,
          pageSize: limit
        }
      };

    } catch (error) {
      console.error('Error fetching stores:', error);
      return {
        data: [],
        pagination: {
          cursor: null,
          hasMore: false,
          total: 0,
          page: 1,
          pageSize: limit
        }
      };
    }
  }

  /**
   * Search stores with filters
   */
  async searchStores(
    query: string,
    filters?: SearchFilters,
    limit: number = 50
  ): Promise<PaginatedResponse<Store>> {
    return this.fetchStores(0, limit, { ...filters, query });
  }

  /**
   * Get aggregated statistics
   */
  async getAggregatedStats(filters?: SearchFilters): Promise<AggregatedStats> {
    try {
      const { rows: storeStats } = await postgres.query(
        `SELECT 
                count(*) as total_stores,
                sum(case when is_active = true then 1 else 0 end) as active_stores
             FROM stores WHERE firm_nr = $1`,
        [ERP_SETTINGS.firmNr]
      );

      // Sales aggregation from rewritten 'sales' table
      const { rows: salesStats } = await postgres.query(
        `SELECT 
                sum(total_gross) as total_revenue,
                count(*) as total_transactions
             FROM sales 
             WHERE status = 'completed'`
      );

      const totalRevenue = parseFloat(salesStats[0]?.total_revenue || '0');
      const totalTransactions = parseInt(salesStats[0]?.total_transactions || '0');
      const avgBasket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

      return {
        totalRevenue,
        totalTransactions,
        avgBasket,
        activeStores: parseInt(storeStats[0]?.active_stores || '0'),
        totalStores: parseInt(storeStats[0]?.total_stores || '0'),
        calculatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting aggregated stats:', error);
      return {
        totalRevenue: 0,
        totalTransactions: 0,
        avgBasket: 0,
        activeStores: 0,
        totalStores: 0,
        calculatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Get statistics by region
   */
  async getRegionStats(): Promise<RegionStats[]> {
    try {
      // Complex aggregation using joined tables.
      // Sales (rewritten) JOIN stores (public)
      // Note: sales.store_id was added in migration 013
      const { rows } = await postgres.query(
        `SELECT 
                s.region,
                count(DISTINCT s.id) as store_count,
                sum(sa.total_gross) as revenue,
                count(sa.id) as transactions
             FROM stores s
             LEFT JOIN sales sa ON s.id = sa.store_id
             WHERE s.firm_nr = $1
             GROUP BY s.region`,
        [ERP_SETTINGS.firmNr]
      );

      return rows.map(r => {
        const regionName = r.region || 'Bilinmiyor';
        const revenue = parseFloat(r.revenue || '0');
        const transactions = parseInt(r.transactions || '0');

        return {
          regionId: regionName.toLowerCase().replace(/\s/g, '-'),
          regionName,
          storeCount: parseInt(r.store_count || '0'),
          revenue,
          transactions,
          avgBasket: transactions > 0 ? revenue / transactions : 0
        };
      });

    } catch (error) {
      console.error('Error getting region stats:', error);
      return [];
    }
  }

  /**
   * Get top performing stores
   */
  async getTopStores(limit: number = 10): Promise<Array<Store & { stats: StoreStats }>> {
    try {
      const { rows } = await postgres.query(
        `SELECT 
                s.*,
                coalesce(sum(sa.total_gross), 0) as revenue,
                count(sa.id) as transactions
             FROM stores s
             LEFT JOIN sales sa ON s.id = sa.store_id
             WHERE s.firm_nr = $1
             GROUP BY s.id
             ORDER BY revenue DESC
             LIMIT $2`,
        [ERP_SETTINGS.firmNr, limit]
      );

      return rows.map((dbStore: any) => {
        const revenue = parseFloat(dbStore.revenue);
        const transactions = parseInt(dbStore.transactions);

        return {
          id: dbStore.id,
          code: dbStore.code,
          name: dbStore.name,
          region: dbStore.region || 'Bilinmiyor',
          subRegion: dbStore.city || '',
          city: dbStore.city || '',
          district: dbStore.address || '',
          manager: dbStore.manager_name || 'Atanmadı',
          phone: dbStore.phone || '',
          status: dbStore.is_active ? 'active' : 'inactive',
          openingDate: dbStore.created_at,
          size: 0,
          employeeCount: 0,
          isMain: dbStore.is_main,
          stats: {
            storeId: dbStore.id,
            date: new Date().toISOString().split('T')[0],
            revenue,
            transactionCount: transactions,
            customerCount: Math.floor(transactions * 0.8),
            avgBasket: transactions > 0 ? revenue / transactions : 0,
            cashBalance: 0,
            stockValue: 0
          }
        };
      });
    } catch (error) {
      console.error('Error getting top stores:', error);
      return [];
    }
  }

  /**
   * Get critical alerts
   */
  async getCriticalAlerts(limit: number = 50): Promise<StoreAlert[]> {
    return [];
  }

  /**
   * Get store stats
   */
  async getStoreStats(storeId: string): Promise<StoreStats> {
    try {
      const { rows } = await postgres.query(
        `SELECT 
                sum(total_gross) as total_revenue,
                count(*) as total_transactions
             FROM sales 
             WHERE store_id = $1 AND status = 'completed'`,
        [storeId]
      );

      const revenue = parseFloat(rows[0]?.total_revenue || '0');
      const transactions = parseInt(rows[0]?.total_transactions || '0');

      return {
        storeId,
        date: new Date().toISOString().split('T')[0],
        revenue,
        transactionCount: transactions,
        customerCount: Math.floor(transactions * 0.8),
        avgBasket: transactions > 0 ? revenue / transactions : 0,
        cashBalance: 0,
        stockValue: 0
      };
    } catch (error) {
      console.error('Error getting store stats:', error);
      return {
        storeId,
        date: new Date().toISOString().split('T')[0],
        revenue: 0,
        transactionCount: 0,
        customerCount: 0,
        avgBasket: 0,
        cashBalance: 0,
        stockValue: 0
      };
    }
  }

  /**
   * Create new store
   */
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
          store.manager
        ]
      );
      const data = rows[0];

      return {
        id: data.id,
        code: data.code,
        name: data.name,
        region: data.region || 'Bilinmiyor',
        subRegion: data.city || '',
        city: data.city || '',
        district: data.address || '',
        manager: data.manager_name || 'Atanmadı',
        phone: data.phone || '',
        status: data.is_active ? 'active' : 'inactive',
        openingDate: data.created_at,
        size: 0,
        employeeCount: 0,
        isMain: data.is_main
      };
    } catch (error) {
      console.error('Error creating store:', error);
      throw error;
    }
  }

  /**
   * Update store
   */
  async updateStore(id: string, updates: Partial<Store>): Promise<Store> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      if (updates.code) { fields.push(`code = $${i++}`); values.push(updates.code); }
      if (updates.name) { fields.push(`name = $${i++}`); values.push(updates.name); }
      if (updates.region) { fields.push(`region = $${i++}`); values.push(updates.region); }
      if (updates.city) { fields.push(`city = $${i++}`); values.push(updates.city); }
      if (updates.district) { fields.push(`address = $${i++}`); values.push(updates.district); }
      if (updates.phone) { fields.push(`phone = $${i++}`); values.push(updates.phone); }
      if (updates.status) { fields.push(`is_active = $${i++}`); values.push(updates.status === 'active'); }
      if (updates.isMain !== undefined) { fields.push(`is_main = $${i++}`); values.push(updates.isMain); }
      if (updates.manager) { fields.push(`manager_name = $${i++}`); values.push(updates.manager); }

      if (fields.length === 0) throw new Error("No updates provided");

      values.push(id);
      const { rows } = await postgres.query(
        `UPDATE stores SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      );
      const data = rows[0];

      return {
        id: data.id,
        code: data.code,
        name: data.name,
        region: data.region || 'Bilinmiyor',
        subRegion: data.city || '',
        city: data.city || '',
        district: data.address || '',
        manager: data.manager_name || 'Atanmadı',
        phone: data.phone || '',
        status: data.is_active ? 'active' : 'inactive',
        openingDate: data.created_at,
        size: 0,
        employeeCount: 0,
        isMain: data.is_main
      };
    } catch (error) {
      console.error('Error updating store:', error);
      throw error;
    }
  }

  /**
   * Delete store
   */
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
        `SELECT DISTINCT region FROM stores WHERE firm_nr = $1 AND region IS NOT NULL`,
        [ERP_SETTINGS.firmNr]
      );
      return rows.map(r => ({ id: r.region, name: r.region, subRegions: [] }));
    } catch (error) {
      console.error('Error getting regions:', error);
      return [];
    }
  }
}

export const storeApiService = new StoreApiService();

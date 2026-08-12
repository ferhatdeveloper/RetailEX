/**
 * Campaigns API - Direct PostgreSQL Implementation
 * Note: Uses rex_{firm}_campaigns table
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import type { Campaign } from '../../core/types';

export const campaignsAPI = {
  /**
   * Get all campaigns
   */
  async getAll(): Promise<Campaign[]> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_campaigns`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: '*',
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            order: 'priority.asc',
          },
          { schema: 'public' }
        );
        return (Array.isArray(rows) ? rows : []).map(mapDatabaseCampaignToCampaign);
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE firm_nr = $1 ORDER BY priority ASC`,
        [ERP_SETTINGS.firmNr]
      );
      return rows.map(mapDatabaseCampaignToCampaign);
    } catch (error) {
      console.error('[CampaignsAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Get active campaigns
   */
  async getActive(): Promise<Campaign[]> {
    try {
      const now = new Date().toISOString();
      const tableName = `rex_${ERP_SETTINGS.firmNr}_campaigns`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: '*',
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            is_active: 'eq.true',
            start_date: `lte.${now}`,
            end_date: `gte.${now}`,
            order: 'priority.asc',
          },
          { schema: 'public' }
        );
        return (Array.isArray(rows) ? rows : []).map(mapDatabaseCampaignToCampaign);
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} 
         WHERE is_active = true AND start_date <= $1 AND end_date >= $1 AND firm_nr = $2
         ORDER BY priority ASC`,
        [now, ERP_SETTINGS.firmNr]
      );
      return rows.map(mapDatabaseCampaignToCampaign);
    } catch (error) {
      console.error('[CampaignsAPI] getActive failed:', error);
      return [];
    }
  },

  /**
   * Get campaign by ID
   */
  async getById(id: string): Promise<Campaign | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_campaigns`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: '*',
            id: `eq.${id}`,
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            limit: 1,
          },
          { schema: 'public' }
        );
        const r = Array.isArray(rows) ? rows[0] : null;
        return r ? mapDatabaseCampaignToCampaign(r) : null;
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      return rows[0] ? mapDatabaseCampaignToCampaign(rows[0]) : null;
    } catch (error) {
      console.error('[CampaignsAPI] getById failed:', error);
      return null;
    }
  },

  /**
   * Create new campaign
   */
  async create(campaign: Omit<Campaign, 'id'>): Promise<Campaign | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_campaigns`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const body: Record<string, unknown> = {
          name: campaign.name,
          description: campaign.description,
          type: campaign.type,
          discount_type: campaign.discountType,
          discount_value: campaign.discountValue,
          start_date: campaign.startDate,
          end_date: campaign.endDate,
          is_active: campaign.active !== undefined ? campaign.active : true,
          min_purchase_amount: campaign.minPurchaseAmount || 0,
          max_discount_amount: campaign.maxDiscountAmount ?? null,
          applicable_categories: campaign.categoryId || null,
          applicable_products: campaign.productIds || [],
          priority: campaign.priority || 0,
          firm_nr: ERP_SETTINGS.firmNr,
        };
        const rows = await postgrest.post<any[]>(
          `/${tableName}`,
          body,
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return row ? mapDatabaseCampaignToCampaign(row) : null;
      }
      const { rows } = await postgres.query(
        `INSERT INTO ${tableName} (
            name, description, type, discount_type, discount_value, 
            start_date, end_date, is_active, min_purchase_amount, 
            max_discount_amount, applicable_categories, applicable_products, 
            priority, firm_nr
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [
          campaign.name,
          campaign.description,
          campaign.type,
          campaign.discountType,
          campaign.discountValue,
          campaign.startDate,
          campaign.endDate,
          campaign.active !== undefined ? campaign.active : true,
          campaign.minPurchaseAmount || 0,
          campaign.maxDiscountAmount || null,
          campaign.categoryId || null,
          JSON.stringify(campaign.productIds || []),
          campaign.priority || 0,
          ERP_SETTINGS.firmNr
        ]
      );
      return mapDatabaseCampaignToCampaign(rows[0]);
    } catch (error: any) {
      console.error('[CampaignsAPI] create failed:', error);
      throw new Error('Kampanya eklenemedi');
    }
  },

  /**
   * Update campaign
   */
  async update(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      const mapping: Record<string, string> = {
        name: 'name',
        description: 'description',
        type: 'type',
        discountType: 'discount_type',
        discountValue: 'discount_value',
        startDate: 'start_date',
        endDate: 'end_date',
        active: 'is_active',
        minPurchaseAmount: 'min_purchase_amount',
        maxDiscountAmount: 'max_discount_amount',
        categoryId: 'applicable_categories',
        productIds: 'applicable_products',
        priority: 'priority'
      };

      Object.entries(updates).forEach(([key, value]) => {
        if (mapping[key] && value !== undefined) {
          fields.push(`${mapping[key]} = $${i++}`);
          values.push(Array.isArray(value) ? JSON.stringify(value) : value);
        }
      });

      if (fields.length === 0) return this.getById(id);

      const tableName = `rex_${ERP_SETTINGS.firmNr}_campaigns`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const patchBody: Record<string, unknown> = {};
        Object.entries(updates).forEach(([key, value]) => {
          if (!mapping[key] || value === undefined) return;
          const col = mapping[key];
          if (key === 'productIds') {
            if (Array.isArray(value)) patchBody[col] = value;
            else if (typeof value === 'string') {
              try {
                patchBody[col] = JSON.parse(value);
              } catch {
                patchBody[col] = [];
              }
            } else patchBody[col] = value;
          } else {
            patchBody[col] = value;
          }
        });
        const rows = await postgrest.patch<any[]>(
          `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`,
          patchBody,
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return row ? mapDatabaseCampaignToCampaign(row) : this.getById(id);
      }
      values.push(id);
      values.push(ERP_SETTINGS.firmNr);
      const { rows } = await postgres.query(
        `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${i} AND firm_nr = $${i + 1} RETURNING *`,
        values
      );

      return mapDatabaseCampaignToCampaign(rows[0]);
    } catch (error: any) {
      console.error('[CampaignsAPI] update failed:', error);
      throw new Error('Kampanya güncellenemedi');
    }
  },

  /**
   * Delete campaign
   */
  async delete(id: string): Promise<boolean> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_campaigns`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const deleted = await postgrest.delete<any[]>(
          `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`,
          { schema: 'public', prefer: 'return=representation' }
        );
        return Array.isArray(deleted) ? deleted.length > 0 : Boolean(deleted);
      }
      const { rowCount } = await postgres.query(
        `DELETE FROM ${tableName} WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      return rowCount > 0;
    } catch (error) {
      console.error('[CampaignsAPI] delete failed:', error);
      return false;
    }
  },

  /**
   * Set campaign active status
   */
  async setActive(id: string, isActive: boolean): Promise<boolean> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_campaigns`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.patch<any[]>(
          `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`,
          { is_active: isActive },
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return Boolean(row);
      }
      const { rowCount } = await postgres.query(
        `UPDATE ${tableName} SET is_active = $1 WHERE id = $2 AND firm_nr = $3`,
        [isActive, id, ERP_SETTINGS.firmNr]
      );
      return rowCount > 0;
    } catch (error) {
      console.error('[CampaignsAPI] setActive failed:', error);
      return false;
    }
  },

  /**
   * Get campaigns by type
   */
  async getByType(type: string): Promise<Campaign[]> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_campaigns`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: '*',
            type: `eq.${type}`,
            is_active: 'eq.true',
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            order: 'priority.asc',
          },
          { schema: 'public' }
        );
        return (Array.isArray(rows) ? rows : []).map(mapDatabaseCampaignToCampaign);
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE type = $1 AND is_active = true AND firm_nr = $2 ORDER BY priority ASC`,
        [type, ERP_SETTINGS.firmNr]
      );
      return rows.map(mapDatabaseCampaignToCampaign);
    } catch (error) {
      console.error('[CampaignsAPI] getByType failed:', error);
      return [];
    }
  },
};

/**
 * Helper: Map database campaign to Campaign type
 */
function mapDatabaseCampaignToCampaign(dbCampaign: any): Campaign {
  return {
    id: dbCampaign.id,
    name: dbCampaign.name,
    description: dbCampaign.description,
    type: dbCampaign.type,
    discountType: dbCampaign.discount_type,
    discountValue: parseFloat(dbCampaign.discount_value || 0),
    startDate: dbCampaign.start_date,
    endDate: dbCampaign.end_date,
    active: dbCampaign.is_active,
    minPurchaseAmount: parseFloat(dbCampaign.min_purchase_amount || 0),
    maxDiscountAmount: dbCampaign.max_discount_amount ? parseFloat(dbCampaign.max_discount_amount) : undefined,
    categoryId: dbCampaign.applicable_categories,
    productIds: typeof dbCampaign.applicable_products === 'string' ? JSON.parse(dbCampaign.applicable_products) : (dbCampaign.applicable_products || []),
    priority: dbCampaign.priority || 0,
    createdAt: dbCampaign.created_at,
    updatedAt: dbCampaign.updated_at,
  };
}

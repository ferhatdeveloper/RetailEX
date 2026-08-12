/**
 * Cost Center API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  firm_nr: string;
  created_at?: string;
}

export const costCenterAPI = {
  /**
   * Ensure table exists
   */
  async ensureTableExists(): Promise<void> {
    const tableName = `rex_${ERP_SETTINGS.firmNr}_cost_centers`;
    await postgres.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        firm_nr VARCHAR(10) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(code, firm_nr)
      )
    `);
  },

  /**
   * Get all cost centers
   */
  async getAll(): Promise<CostCenter[]> {
    try {
      await this.ensureTableExists();
      const tableName = `rex_${ERP_SETTINGS.firmNr}_cost_centers`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE firm_nr = $1 AND is_active = true ORDER BY name ASC`,
        [ERP_SETTINGS.firmNr]
      );
      return rows;
    } catch (error) {
      console.error('[CostCenterAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Create new cost center
   */
  async create(costCenter: Omit<CostCenter, 'id' | 'firm_nr' | 'created_at'>): Promise<CostCenter | null> {
    try {
      await this.ensureTableExists();
      const tableName = `rex_${ERP_SETTINGS.firmNr}_cost_centers`;
      const { rows } = await postgres.query(
        `INSERT INTO ${tableName} (code, name, description, is_active, firm_nr) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          costCenter.code,
          costCenter.name,
          costCenter.description || '',
          costCenter.is_active ?? true,
          ERP_SETTINGS.firmNr
        ]
      );
      return rows[0];
    } catch (error) {
      console.error('[CostCenterAPI] create failed:', error);
      throw error;
    }
  },

  /**
   * Update cost center
   */
  async update(id: string, updates: Partial<CostCenter>): Promise<CostCenter | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_cost_centers`;
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'id' || key === 'firm_nr' || key === 'created_at' || value === undefined) return;
        fields.push(`${key} = $${i++}`);
        values.push(value);
      });

      if (fields.length === 0) return null;

      values.push(id);
      values.push(ERP_SETTINGS.firmNr);
      const { rows } = await postgres.query(
        `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${i} AND firm_nr = $${i + 1} RETURNING *`,
        values
      );

      return rows[0];
    } catch (error) {
      console.error('[CostCenterAPI] update failed:', error);
      throw error;
    }
  },

  /**
   * Delete cost center (soft delete)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_cost_centers`;
      const { rowCount } = await postgres.query(
        `UPDATE ${tableName} SET is_active = false WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      return rowCount > 0;
    } catch (error) {
      console.error('[CostCenterAPI] delete failed:', error);
      return false;
    }
  }
};

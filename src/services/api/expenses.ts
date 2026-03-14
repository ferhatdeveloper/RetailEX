/**
 * Expenses API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  document_number?: string;
  document_url?: string;
  store_id: string;
  cost_center_id?: string;
  cost_center_name?: string;
  expense_date: string;
  notes?: string;
  created_by: string;
  firm_nr: string;
  created_at?: string;
}

export const expenseAPI = {
  /**
   * Ensure table exists
   */
  async ensureTableExists(): Promise<void> {
    const tableName = `rex_${ERP_SETTINGS.firmNr}_expenses`;
    await postgres.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        document_number VARCHAR(100),
        document_url TEXT,
        store_id UUID,
        cost_center_id UUID,
        expense_date DATE NOT NULL,
        notes TEXT,
        created_by UUID,
        firm_nr VARCHAR(10) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },

  /**
   * Get all expenses with joined cost center names
   */
  async getAll(filters?: { startDate?: string; endDate?: string }): Promise<Expense[]> {
    try {
      await this.ensureTableExists();
      const expTable = `rex_${ERP_SETTINGS.firmNr}_expenses`;
      const ccTable = `rex_${ERP_SETTINGS.firmNr}_cost_centers`;
      
      let sql = `
        SELECT e.*, cc.name as cost_center_name 
        FROM ${expTable} e
        LEFT JOIN ${ccTable} cc ON e.cost_center_id = cc.id
        WHERE e.firm_nr = $1
      `;
      const params: any[] = [ERP_SETTINGS.firmNr];
      
      if (filters?.startDate) {
        sql += ` AND e.expense_date >= $${params.length + 1}`;
        params.push(filters.startDate);
      }
      if (filters?.endDate) {
        sql += ` AND e.expense_date <= $${params.length + 1}`;
        params.push(filters.endDate);
      }
      
      sql += ` ORDER BY e.expense_date DESC`;
      
      const { rows } = await postgres.query(sql, params);
      return rows;
    } catch (error) {
      console.error('[ExpenseAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Create new expense
   */
  async create(expense: Omit<Expense, 'id' | 'firm_nr' | 'created_at'>): Promise<Expense | null> {
    try {
      await this.ensureTableExists();
      const tableName = `rex_${ERP_SETTINGS.firmNr}_expenses`;
      const { rows } = await postgres.query(
        `INSERT INTO ${tableName} (
          category, description, amount, payment_method, 
          document_number, document_url, store_id, cost_center_id, 
          expense_date, notes, created_by, firm_nr
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          expense.category,
          expense.description,
          expense.amount,
          expense.payment_method,
          expense.document_number || '',
          expense.document_url || '',
          expense.store_id || null,
          expense.cost_center_id || null,
          expense.expense_date,
          expense.notes || '',
          expense.created_by || null,
          ERP_SETTINGS.firmNr
        ]
      );
      return rows[0];
    } catch (error) {
      console.error('[ExpenseAPI] create failed:', error);
      throw error;
    }
  },

  /**
   * Update expense
   */
  async update(id: string, updates: Partial<Expense>): Promise<Expense | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_expenses`;
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (['id', 'firm_nr', 'created_at', 'cost_center_name'].includes(key) || value === undefined) return;
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
      console.error('[ExpenseAPI] update failed:', error);
      throw error;
    }
  },

  /**
   * Delete expense
   */
  async delete(id: string): Promise<boolean> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_expenses`;
      const { rowCount } = await postgres.query(
        `DELETE FROM ${tableName} WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      return rowCount > 0;
    } catch (error) {
      console.error('[ExpenseAPI] delete failed:', error);
      return false;
    }
  }
};

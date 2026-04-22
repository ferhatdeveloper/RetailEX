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
  cash_line_id?: string;
  cash_register_id?: string;
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
        cash_line_id UUID,
        cash_register_id UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Backward compatibility for existing databases
    await postgres.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS cash_line_id UUID`);
    await postgres.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS cash_register_id UUID`);
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
      const payMethod = String(expense.payment_method || '').trim().toLowerCase();
      const isCashExpense = payMethod === 'cash' || payMethod === 'nakit';

      await postgres.query('BEGIN');

      const { rows } = await postgres.query(
        `INSERT INTO ${tableName} (
          category, description, amount, payment_method, 
          document_number, document_url, store_id, cost_center_id, 
          expense_date, notes, created_by, firm_nr, cash_register_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::text::uuid) RETURNING *`,
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
          ERP_SETTINGS.firmNr,
          expense.cash_register_id || null
        ]
      );

      const insertedExpense = rows[0];
      if (!insertedExpense) {
        throw new Error('Gider kaydı oluşturulamadı');
      }

      if (isCashExpense) {
        const preferredRegisterId = String(expense.cash_register_id || '').trim();
        const kasaQuery = preferredRegisterId
          ? `SELECT id, code, currency_code
             FROM cash_registers
             WHERE is_active = true AND id = $1::text::uuid
             LIMIT 1`
          : `SELECT id, code, currency_code
             FROM cash_registers
             WHERE is_active = true
             ORDER BY
               CASE WHEN UPPER(COALESCE(code, '')) LIKE '%ANA%' THEN 0 ELSE 1 END,
               created_at ASC
             LIMIT 1`;
        const kasaParams = preferredRegisterId ? [preferredRegisterId] : [];
        const { rows: kasaRows } = await postgres.query(kasaQuery, kasaParams);
        const kasa = kasaRows[0];
        if (!kasa?.id) {
          throw new Error('Nakit gider için aktif kasa bulunamadı. Lütfen önce kasa tanımlayın.');
        }

        const ficheNo = `EXP-${ERP_SETTINGS.firmNr}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const { rows: lineRows } = await postgres.query(
          `INSERT INTO cash_lines (
             firm_nr, period_nr, register_id, fiche_no, date, amount, sign, definition, transaction_type,
             currency_code, exchange_rate, f_amount, transfer_status, special_code, tax_rate, withholding_tax_rate
           ) VALUES (
             $1::text, $2::text, $3::text::uuid, $4::text, $5::text::date, $6::text::numeric, -1,
             $7::text, 'GIDER_PUSULASI', $8::text, 1, $9::text::numeric, 0, $10::text, 0, 0
           ) RETURNING id`,
          [
            ERP_SETTINGS.firmNr,
            ERP_SETTINGS.periodNr || '01',
            kasa.id,
            ficheNo,
            expense.expense_date,
            expense.amount,
            expense.description || 'Gider',
            kasa.currency_code || 'IQD',
            expense.amount,
            expense.category || ''
          ]
        );
        const cashLineId = lineRows[0]?.id;
        if (!cashLineId) {
          throw new Error('Kasa gider satırı oluşturulamadı');
        }

        await postgres.query(
          `UPDATE cash_registers
           SET balance = balance - $1::text::numeric
           WHERE id = $2::text::uuid`,
          [expense.amount, kasa.id]
        );

        const { rows: linkedRows } = await postgres.query(
          `UPDATE ${tableName}
           SET cash_line_id = $1::text::uuid, cash_register_id = $2::text::uuid
           WHERE id = $3::text::uuid
           RETURNING *`,
          [cashLineId, kasa.id, insertedExpense.id]
        );

        await postgres.query('COMMIT');
        return linkedRows[0] || insertedExpense;
      }

      await postgres.query('COMMIT');
      return insertedExpense;
    } catch (error) {
      console.error('[ExpenseAPI] create failed:', error);
      try {
        await postgres.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw error;
    }
  },

  /**
   * Update expense
   */
  async update(id: string, updates: Partial<Expense>): Promise<Expense | null> {
    try {
      await this.ensureTableExists();
      const tableName = `rex_${ERP_SETTINGS.firmNr}_expenses`;
      const { rows: existingRows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND firm_nr = $2 LIMIT 1`,
        [id, ERP_SETTINGS.firmNr]
      );
      const existing = existingRows[0] as Expense | undefined;
      if (!existing) return null;

      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      const uuidFields = new Set(['store_id', 'cost_center_id', 'cash_register_id', 'cash_line_id', 'created_by']);
      const emptyAsNullFields = new Set(['document_number', 'document_url', 'notes']);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      Object.entries(updates).forEach(([key, value]) => {
        if (['id', 'firm_nr', 'created_at', 'cost_center_name'].includes(key) || value === undefined) return;

        let normalizedValue = value;
        if (typeof normalizedValue === 'string') {
          const trimmed = normalizedValue.trim();
          if (uuidFields.has(key)) {
            normalizedValue = trimmed === '' || !uuidPattern.test(trimmed) ? null : trimmed;
          } else if (emptyAsNullFields.has(key)) {
            normalizedValue = trimmed === '' ? null : trimmed;
          } else {
            normalizedValue = trimmed;
          }
        }

        fields.push(`${key} = $${i++}`);
        values.push(normalizedValue);
      });

      if (fields.length === 0) return null;

      await postgres.query('BEGIN');

      values.push(id);
      values.push(ERP_SETTINGS.firmNr);
      const { rows } = await postgres.query(
        `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${i} AND firm_nr = $${i + 1} RETURNING *`,
        values
      );

      const updated = rows[0] as Expense | undefined;
      if (!updated) {
        await postgres.query('ROLLBACK');
        return null;
      }

      // If this expense is linked to a cash line, keep amount/date/description synchronized.
      if (updated.cash_line_id && updated.cash_register_id) {
        const oldAmount = Number(existing.amount || 0);
        const newAmount = Number(updated.amount || 0);
        const delta = newAmount - oldAmount;

        await postgres.query(
          `UPDATE cash_lines
           SET amount = $1::text::numeric,
               f_amount = $1::text::numeric,
               date = $2::text::date,
               definition = $3::text
           WHERE id = $4::text::uuid`,
          [newAmount, updated.expense_date, updated.description || 'Gider', updated.cash_line_id]
        );

        if (delta !== 0) {
          // cash expense uses sign=-1, so register balance changes inversely with amount delta.
          await postgres.query(
            `UPDATE cash_registers
             SET balance = balance - $1::text::numeric
             WHERE id = $2::text::uuid`,
            [delta, updated.cash_register_id]
          );
        }
      }

      await postgres.query('COMMIT');
      return updated;
    } catch (error) {
      console.error('[ExpenseAPI] update failed:', error);
      try {
        await postgres.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw error;
    }
  },

  /**
   * Delete expense
   */
  async delete(id: string): Promise<boolean> {
    try {
      await this.ensureTableExists();
      const tableName = `rex_${ERP_SETTINGS.firmNr}_expenses`;
      const { rows: existingRows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND firm_nr = $2 LIMIT 1`,
        [id, ERP_SETTINGS.firmNr]
      );
      const existing = existingRows[0] as Expense | undefined;
      if (!existing) return false;

      await postgres.query('BEGIN');

      if (existing.cash_line_id && existing.cash_register_id) {
        // Reverse balance effect created by cash expense.
        await postgres.query(
          `UPDATE cash_registers
           SET balance = balance + $1::text::numeric
           WHERE id = $2::text::uuid`,
          [existing.amount || 0, existing.cash_register_id]
        );
        await postgres.query(
          `DELETE FROM cash_lines WHERE id = $1::text::uuid`,
          [existing.cash_line_id]
        );
      }

      const { rowCount } = await postgres.query(
        `DELETE FROM ${tableName} WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      await postgres.query('COMMIT');
      return rowCount > 0;
    } catch (error) {
      console.error('[ExpenseAPI] delete failed:', error);
      try {
        await postgres.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      return false;
    }
  }
};

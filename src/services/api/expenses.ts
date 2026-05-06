/**
 * Expenses API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { createKasaIslemi } from './kasa';

function padExpenseFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function padExpensePeriodNr(): string {
  return String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
}

function expenseTablePath(): string {
  return `/rex_${ERP_SETTINGS.firmNr}_expenses`;
}

function cashLinesPathRest(): string {
  return `/rex_${padExpenseFirmNr()}_${padExpensePeriodNr()}_cash_lines`;
}

function cashRegistersPathRest(): string {
  return `/rex_${padExpenseFirmNr()}_cash_registers`;
}

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
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      return;
    }
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

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const fn = padExpenseFirmNr();
        const q: Record<string, string> = {
          select: '*',
          firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
          order: 'expense_date.desc',
          limit: 2000,
        };
        if (filters?.startDate && !filters?.endDate) {
          q.expense_date = `gte.${String(filters.startDate).slice(0, 10)}`;
        } else if (filters?.endDate && !filters?.startDate) {
          q.expense_date = `lte.${String(filters.endDate).slice(0, 10)}`;
        }
        const expRows = await postgrest
          .get<any[]>(`/${expTable}`, q, { schema: 'public' })
          .catch(() => [] as any[]);
        let list = Array.isArray(expRows) ? expRows : [];
        if (filters?.startDate && filters?.endDate) {
          const s = String(filters.startDate).slice(0, 10);
          const e = String(filters.endDate).slice(0, 10);
          list = list.filter((r) => {
            const d = String(r?.expense_date || '').slice(0, 10);
            return d >= s && d <= e;
          });
        }
        const ccRows = await postgrest
          .get<any[]>(`/${ccTable}`, { select: 'id,name', firm_nr: `eq.${ERP_SETTINGS.firmNr}` }, { schema: 'public' })
          .catch(() => [] as any[]);
        const ccMap = new Map<string, string>();
        (Array.isArray(ccRows) ? ccRows : []).forEach((c) => ccMap.set(String(c.id), String(c.name || '')));
        return list.map((e) => ({
          ...e,
          cost_center_name: e.cost_center_id ? ccMap.get(String(e.cost_center_id)) : undefined,
        }));
      }

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

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const fn = padExpenseFirmNr();
        const { postgrest } = await import('./postgrestClient');
        const path = expenseTablePath();
        const body: Record<string, unknown> = {
          category: expense.category,
          description: expense.description,
          amount: expense.amount,
          payment_method: expense.payment_method,
          document_number: expense.document_number || '',
          document_url: expense.document_url || '',
          store_id: expense.store_id || null,
          cost_center_id: expense.cost_center_id || null,
          expense_date: expense.expense_date,
          notes: expense.notes || '',
          created_by: expense.created_by || null,
          firm_nr: ERP_SETTINGS.firmNr,
          cash_register_id: expense.cash_register_id || null,
        };
        const rows = await postgrest.post<any[]>(path, body, {
          schema: 'public',
          prefer: 'return=representation',
        });
        let inserted = (Array.isArray(rows) ? rows[0] : rows) as Expense | undefined;
        if (!inserted?.id) {
          throw new Error('Gider kaydı oluşturulamadı');
        }

        if (isCashExpense) {
          const preferredRegisterId = String(expense.cash_register_id || '').trim();
          const kasaPath = `/rex_${fn}_cash_registers`;
          const regList = await postgrest
            .get<any[]>(
              kasaPath,
              {
                select: 'id,code,currency_code',
                is_active: 'eq.true',
                limit: 50,
                order: 'created_at.asc',
              },
              { schema: 'public' }
            )
            .catch(() => [] as any[]);
          const regs = Array.isArray(regList) ? regList : [];
          let kasa = preferredRegisterId
            ? regs.find((r) => String(r.id) === preferredRegisterId)
            : undefined;
          if (!kasa && preferredRegisterId) {
            const one = await postgrest
              .get<any[]>(
                kasaPath,
                {
                  select: 'id,code,currency_code',
                  id: `eq.${preferredRegisterId}`,
                  is_active: 'eq.true',
                  limit: 1,
                },
                { schema: 'public' }
              )
              .catch(() => [] as any[]);
            kasa = Array.isArray(one) ? one[0] : undefined;
          }
          if (!kasa) {
            kasa =
              regs.find((r) => String(r.code || '').toUpperCase().includes('ANA')) ||
              regs[0];
          }
          if (!kasa?.id) {
            throw new Error('Nakit gider için aktif kasa bulunamadı. Lütfen önce kasa tanımlayın.');
          }

          const kasaIslem = await createKasaIslemi({
            firma_id: String(ERP_SETTINGS.firmNr),
            kasa_id: kasa.id,
            islem_tarihi: expense.expense_date,
            tutar: expense.amount,
            islem_aciklamasi: expense.description || 'Gider',
            islem_tipi: 'GIDER_PUSULASI',
            doviz_kodu: kasa.currency_code || 'IQD',
            dovizli_tutar: expense.amount,
            ozel_kod: expense.category || '',
          });

          const linked = await postgrest.patch<any[]>(
            `${path}?id=eq.${encodeURIComponent(String(inserted.id))}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`,
            { cash_line_id: kasaIslem.id, cash_register_id: kasa.id },
            { schema: 'public', prefer: 'return=representation' }
          );
          inserted = (Array.isArray(linked) ? linked[0] : linked) as Expense;
        }
        return inserted ?? null;
      }

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
      const firm = String(ERP_SETTINGS.firmNr);

      const uuidFields = new Set(['store_id', 'cost_center_id', 'cash_register_id', 'cash_line_id', 'created_by']);
      const emptyAsNullFields = new Set(['document_number', 'document_url', 'notes']);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      const normalizeUpdateEntry = (key: string, value: unknown): unknown | undefined => {
        if (['id', 'firm_nr', 'created_at', 'cost_center_name'].includes(key) || value === undefined) return undefined;
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
        return normalizedValue;
      };

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const ex = await postgrest.get<any[]>(
          expenseTablePath(),
          { select: '*', id: `eq.${id}`, firm_nr: `eq.${firm}`, limit: 1 },
          { schema: 'public' }
        );
        const existing = Array.isArray(ex) ? ex[0] : null;
        if (!existing) return null;

        const body: Record<string, unknown> = {};
        Object.entries(updates).forEach(([key, value]) => {
          const nv = normalizeUpdateEntry(key, value);
          if (nv !== undefined) body[key] = nv;
        });
        if (Object.keys(body).length === 0) return null;

        const patched = await postgrest.patch<Expense[]>(
          `${expenseTablePath()}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firm)}`,
          body,
          { schema: 'public', prefer: 'return=representation' }
        );
        let updated = (Array.isArray(patched) ? patched[0] : patched) as Expense | undefined;
        if (!updated) return null;

        if (updated.cash_line_id && updated.cash_register_id) {
          const oldAmount = Number(existing.amount || 0);
          const newAmount = Number(updated.amount || 0);
          const delta = newAmount - oldAmount;
          await postgrest.patch(
            `${cashLinesPathRest()}?id=eq.${encodeURIComponent(String(updated.cash_line_id))}`,
            {
              amount: newAmount,
              f_amount: newAmount,
              date: updated.expense_date,
              definition: updated.description || 'Gider',
            },
            { schema: 'public', prefer: 'return=minimal' }
          );
          if (delta !== 0) {
            const regRows = await postgrest.get<any[]>(
              cashRegistersPathRest(),
              { select: 'balance', id: `eq.${String(updated.cash_register_id)}`, limit: 1 },
              { schema: 'public' }
            );
            const row = Array.isArray(regRows) ? regRows[0] : null;
            const b = Number(row?.balance ?? 0);
            await postgrest.patch(
              `${cashRegistersPathRest()}?id=eq.${encodeURIComponent(String(updated.cash_register_id))}`,
              { balance: b - delta },
              { schema: 'public', prefer: 'return=minimal' }
            );
          }
        }
        return updated;
      }

      const { rows: existingRows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND firm_nr = $2 LIMIT 1`,
        [id, ERP_SETTINGS.firmNr]
      );
      const existing = existingRows[0] as Expense | undefined;
      if (!existing) return null;

      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      Object.entries(updates).forEach(([key, value]) => {
        const nv = normalizeUpdateEntry(key, value);
        if (nv === undefined) return;
        fields.push(`${key} = $${i++}`);
        values.push(nv);
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
      const firm = String(ERP_SETTINGS.firmNr);

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const ex = await postgrest.get<any[]>(
          expenseTablePath(),
          { select: '*', id: `eq.${id}`, firm_nr: `eq.${firm}`, limit: 1 },
          { schema: 'public' }
        );
        const existing = Array.isArray(ex) ? ex[0] : null;
        if (!existing) return false;

        if (existing.cash_line_id && existing.cash_register_id) {
          const amt = Number(existing.amount || 0);
          const regRows = await postgrest.get<any[]>(
            cashRegistersPathRest(),
            { select: 'balance', id: `eq.${String(existing.cash_register_id)}`, limit: 1 },
            { schema: 'public' }
          );
          const row = Array.isArray(regRows) ? regRows[0] : null;
          const b = Number(row?.balance ?? 0);
          await postgrest.patch(
            `${cashRegistersPathRest()}?id=eq.${encodeURIComponent(String(existing.cash_register_id))}`,
            { balance: b + amt },
            { schema: 'public', prefer: 'return=minimal' }
          );
          await postgrest.delete(
            `${cashLinesPathRest()}?id=eq.${encodeURIComponent(String(existing.cash_line_id))}`,
            { schema: 'public', prefer: 'return=minimal' }
          );
        }
        await postgrest.delete(
          `${expenseTablePath()}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firm)}`,
          { schema: 'public', prefer: 'return=minimal' }
        );
        return true;
      }

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

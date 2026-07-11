/**
 * Customer API - Direct PostgreSQL Implementation
 * Note: Uses rex_{firm}_customers table
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import type { Customer } from '../../core/types';
import {
  firmCustomersTable,
  sqlCustomerAccountBalancesCte,
  sqlResolvedCustomerBalanceExpr,
  computeCustomerBalanceFromLedger,
  normalizeFirmTableNr,
} from './accountBalance';

export const customerAPI = {
  /**
   * Get all customers
   */
  async getAll(): Promise<Customer[]> {
    try {
      const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
      const tableName = firmCustomersTable(firmNr);
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
        const salesPath = `/rex_${firmNr}_${pn}_sales`;
        const cashPath = `/rex_${firmNr}_${pn}_cash_lines`;
        const [rows, salesRows, cashRows] = await Promise.all([
          postgrest.get<any[]>(
            `/${tableName}`,
            {
              select: '*',
              firm_nr: `eq.${firmNr}`,
              is_active: 'eq.true',
              order: 'name.asc',
            },
            { schema: 'public' }
          ),
          postgrest
            .get<any[]>(
              salesPath,
              {
                select: 'customer_id,customer_name,net_amount,fiche_type,is_cancelled,payment_method',
                is_cancelled: 'eq.false',
                limit: '10000',
              },
              { schema: 'public' }
            )
            .catch(() => [] as any[]),
          postgrest
            .get<any[]>(
              cashPath,
              {
                select: 'customer_id,amount,transaction_type',
                transaction_type: 'in.(CH_ODEME,CH_TAHSILAT)',
                limit: '50000',
              },
              { schema: 'public' }
            )
            .catch(() => [] as any[]),
        ]);
        const sales = Array.isArray(salesRows) ? salesRows : [];
        const cash = Array.isArray(cashRows) ? cashRows : [];
        return (Array.isArray(rows) ? rows : []).map((r) =>
          mapDatabaseCustomerToCustomer({
            ...r,
            balance: computeCustomerBalanceFromLedger(
              String(r.id),
              String(r.name || ''),
              sales,
              cash,
              parseFloat(String(r.balance ?? 0)) || 0,
            ),
          }),
        );
      }
      const { rows } = await postgres.query(
        `WITH ${sqlCustomerAccountBalancesCte(tableName, '$1::text')}
        SELECT c.*, ${sqlResolvedCustomerBalanceExpr('c')} AS balance
        FROM ${tableName} c
        LEFT JOIN account_balances b ON c.id = b.id
        WHERE c.firm_nr = $1 AND c.is_active = true
        ORDER BY c.name ASC`,
        [firmNr],
        { firmNr, periodNr: ERP_SETTINGS.periodNr },
      );
      return rows.map(mapDatabaseCustomerToCustomer);
    } catch (error) {
      console.error('[CustomerAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Search customers by name, phone, or code
   */
  async search(query: string): Promise<Customer[]> {
    try {
      if (!query || query.length < 2) return [];
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const raw = query.trim();
        const esc = (s: string) =>
          s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const pat = `*${esc(raw)}*`;
        const or = `(name.ilike.${pat},phone.ilike.${pat},phone2.ilike.${pat},notes.ilike.${pat},occupation.ilike.${pat},file_id.ilike.${pat},code.ilike.${pat})`;
        const rows = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: '*',
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            is_active: 'eq.true',
            or,
            order: 'name.asc',
            limit: 20,
          },
          { schema: 'public' }
        );
        return (Array.isArray(rows) ? rows : []).map(mapDatabaseCustomerToCustomer);
      }
      const searchTerm = `%${query.toLowerCase()}%`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} 
         WHERE firm_nr = $1 
         AND is_active = true 
         AND (
           LOWER(name) LIKE $2 OR 
           phone LIKE $2 OR 
           COALESCE(phone2, '') LIKE $2 OR
           LOWER(COALESCE(notes, '')) LIKE $2 OR
           LOWER(COALESCE(occupation, '')) LIKE $2 OR
           LOWER(COALESCE(file_id, '')) LIKE $2 OR
           LOWER(code) LIKE $2
         )
         ORDER BY name ASC 
         LIMIT 20`,
        [ERP_SETTINGS.firmNr, searchTerm]
      );
      return rows.map(mapDatabaseCustomerToCustomer);
    } catch (error) {
      console.error('[CustomerAPI] search failed:', error);
      return [];
    }
  },

  /**
   * Get customer by ID
   */
  async getById(id: string): Promise<Customer | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
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
        return r ? mapDatabaseCustomerToCustomer(r) : null;
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      return rows[0] ? mapDatabaseCustomerToCustomer(rows[0]) : null;
    } catch (error) {
      console.error('[CustomerAPI] getById failed:', error);
      return null;
    }
  },

  /**
   * Get customer by phone
   */
  async getByPhone(phone: string): Promise<Customer | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const esc = (s: string) =>
          s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const p = phone.trim();
        if (p) {
          const exactOr = `(phone.eq.${esc(p)},phone2.eq.${esc(p)})`;
          const exactRows = await postgrest.get<any[]>(
            `/${tableName}`,
            {
              select: '*',
              firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
              is_active: 'eq.true',
              or: exactOr,
              limit: 1,
            },
            { schema: 'public' }
          );
          if (Array.isArray(exactRows) && exactRows[0]) {
            return mapDatabaseCustomerToCustomer(exactRows[0]);
          }
        }

        const digits = phone.replace(/\D/g, '');
        if (digits.length < 7) return null;
        const tail10 = digits.length >= 10 ? digits.slice(-10) : digits;
        const pat = `*${esc(tail10)}*`;
        const orLike = `(phone.ilike.${pat},phone2.ilike.${pat})`;
        const candidates = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: '*',
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            is_active: 'eq.true',
            or: orLike,
            limit: 50,
            order: 'name.asc',
          },
          { schema: 'public' }
        );
        const list = Array.isArray(candidates) ? candidates : [];
        const norm = (s: string) => String(s || '').replace(/\D/g, '');
        for (const r of list) {
          const np = norm(r.phone);
          const n2 = norm(r.phone2 || '');
          if (np === digits || n2 === digits) return mapDatabaseCustomerToCustomer(r);
          if (np.length >= 10 && np.slice(-10) === tail10) return mapDatabaseCustomerToCustomer(r);
          if (n2.length >= 10 && n2.slice(-10) === tail10) return mapDatabaseCustomerToCustomer(r);
        }
        return null;
      }
      const { rows: exactRows } = await postgres.query(
        `SELECT * FROM ${tableName} 
         WHERE firm_nr = $2 AND is_active = true
           AND (phone = $1 OR COALESCE(phone2, '') = $1)`,
        [phone, ERP_SETTINGS.firmNr]
      );
      if (exactRows[0]) return mapDatabaseCustomerToCustomer(exactRows[0]);

      const digits = phone.replace(/\D/g, '');
      if (digits.length < 7) return null;

      const tail10 = digits.length >= 10 ? digits.slice(-10) : digits;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName}
         WHERE firm_nr = $1 AND is_active = true
           AND (
             REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') = $2
             OR (
               LENGTH(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
               AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $3
             )
             OR REGEXP_REPLACE(COALESCE(phone2, ''), '[^0-9]', '', 'g') = $2
             OR (
               LENGTH(REGEXP_REPLACE(COALESCE(phone2, ''), '[^0-9]', '', 'g')) >= 10
               AND RIGHT(REGEXP_REPLACE(COALESCE(phone2, ''), '[^0-9]', '', 'g'), 10) = $3
             )
           )
         ORDER BY name ASC
         LIMIT 1`,
        [ERP_SETTINGS.firmNr, digits, tail10]
      );
      return rows[0] ? mapDatabaseCustomerToCustomer(rows[0]) : null;
    } catch (error) {
      console.error('[CustomerAPI] getByPhone failed:', error);
      return null;
    }
  },

  /**
   * Create new customer
   */
  async create(customer: Omit<Customer, 'id'>): Promise<Customer | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      let ageSafe: number | null = null;
      if (customer.age !== undefined && customer.age !== null) {
        const n = Number(customer.age);
        if (Number.isFinite(n)) ageSafe = Math.round(n);
      }

      const fileIdSafe =
        customer.file_id != null && String(customer.file_id).trim() !== ''
          ? String(customer.file_id).trim()
          : null;

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const body: Record<string, unknown> = {
          code: customer.code || '',
          name: customer.name,
          phone: customer.phone,
          phone2: customer.phone2 || '',
          email: customer.email || '',
          address: customer.address || '',
          notes: customer.notes || '',
          age: ageSafe,
          occupation: customer.occupation || '',
          file_id: fileIdSafe,
          gender: customer.gender || null,
          customer_tier: customer.customer_tier === 'vip' ? 'vip' : 'normal',
          heard_from: customer.heard_from || null,
          call_plan_enabled: customer.call_plan_enabled === true,
          call_plan_weekdays: customer.call_plan_enabled === true ? customer.call_plan_weekdays ?? [] : [],
          call_plan_note: customer.call_plan_note || null,
          call_last_status: customer.call_last_status || 'planned',
          call_last_note: customer.call_last_note || null,
          call_last_at: customer.call_last_at || null,
          points: customer.points || 0,
          total_spent: customer.totalSpent || 0,
          is_active: true,
          firm_nr: ERP_SETTINGS.firmNr,
        };
        const rows = await postgrest.post<any[]>(
          `/${tableName}`,
          body,
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        const newId = row?.id;
        return newId ? { ...customer, id: newId } as Customer : null;
      }

      const { rows } = await postgres.query(
        `INSERT INTO ${tableName} (
           code, name, phone, phone2, email, address, notes, age, occupation, file_id, gender, customer_tier, heard_from,
           call_plan_enabled, call_plan_weekdays, call_plan_note, call_last_status, call_last_note, call_last_at,
           points, total_spent, is_active, firm_nr
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::smallint[], $16, $17, $18, $19::timestamptz, $20, $21, $22, $23) RETURNING id`,
        [
          customer.code || '',
          customer.name,
          customer.phone,
          customer.phone2 || '',
          customer.email || '',
          customer.address || '',
          customer.notes || '',
          ageSafe,
          customer.occupation || '',
          fileIdSafe,
          customer.gender || null,
          customer.customer_tier === 'vip' ? 'vip' : 'normal',
          customer.heard_from || null,
          customer.call_plan_enabled === true,
          customer.call_plan_enabled === true ? customer.call_plan_weekdays ?? [] : [],
          customer.call_plan_note || null,
          customer.call_last_status || 'planned',
          customer.call_last_note || null,
          customer.call_last_at || null,
          customer.points || 0,
          customer.totalSpent || 0,
          true,
          ERP_SETTINGS.firmNr
        ]
      );

      const newId = rows[0]?.id;
      return newId ? { ...customer, id: newId } as Customer : null;
    } catch (error) {
      console.error('[CustomerAPI] create failed:', error);
      throw error;
    }
  },

  /**
   * Generate next customer code
   */
  async generateCode(): Promise<string> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: 'code',
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            code: 'like.M*',
            order: 'code.desc',
            limit: 1,
          },
          { schema: 'public' }
        );
        if (!Array.isArray(rows) || rows.length === 0) return 'M001';
        const lastCode = rows[0].code;
        const num = parseInt(String(lastCode).substring(1), 10);
        if (Number.isNaN(num)) return 'M001';
        return `M${(num + 1).toString().padStart(3, '0')}`;
      }
      const { rows } = await postgres.query(
        `SELECT code FROM ${tableName} WHERE firm_nr = $1 AND code LIKE 'M%' ORDER BY code DESC LIMIT 1`,
        [ERP_SETTINGS.firmNr]
      );

      if (rows.length === 0) return 'M001';

      const lastCode = rows[0].code;
      const num = parseInt(lastCode.substring(1));
      if (isNaN(num)) return 'M001';

      return `M${(num + 1).toString().padStart(3, '0')}`;
    } catch (error) {
      console.error('[CustomerAPI] generateCode failed:', error);
      return `M${Date.now().toString().slice(-3)}`;
    }
  },

  /**
   * Update customer
   */
  async update(id: string, updates: Partial<Customer>): Promise<Customer | null> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      // V2 customers tablosundaki gerçek sütun adlarına map et
      const customerFieldMap: Record<string, string | null> = {
        totalSpent:    'total_spent',
        taxNumber:     'tax_nr',
        tax_number:    'tax_nr',
        taxOffice:     'tax_office',
        isActive:      'is_active',
        // V2 şemada bu kolonlar yok — atla
        company:        null,
        title:          null,
        totalPurchases: null,
        customerGroup:  null,
        customer_group: null,
        discountRate:   null,
        discount_rate:  null,
        firma_id:       null,
      };
      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'id' || value === undefined) return;
        const mapped = customerFieldMap[key];
        if (mapped === null) return; // V2'de kolonu yok, atla
        const sqlKey = mapped ?? key;
        fields.push(`${sqlKey} = $${i++}`);
        values.push(value);
      });

      if (fields.length === 0) return this.getById(id);

      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const patchBody: Record<string, unknown> = {};
        Object.entries(updates).forEach(([key, value]) => {
          if (key === 'id' || value === undefined) return;
          const mapped = customerFieldMap[key];
          if (mapped === null) return;
          const col = mapped ?? key;
          patchBody[col] = value;
        });
        if (Object.keys(patchBody).length === 0) return this.getById(id);
        const rows = await postgrest.patch<any[]>(
          `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`,
          patchBody,
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return row ? mapDatabaseCustomerToCustomer(row) : this.getById(id);
      }
      values.push(id);
      values.push(ERP_SETTINGS.firmNr);
      const { rows } = await postgres.query(
        `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${i} AND firm_nr = $${i + 1} RETURNING *`,
        values
      );

      return rows[0] ? mapDatabaseCustomerToCustomer(rows[0]) : null;
    } catch (error) {
      console.error('[CustomerAPI] update failed:', error);
      throw error;
    }
  },

  /**
   * Delete customer (soft delete)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.patch<any[]>(
          `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`,
          { is_active: false },
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return Boolean(row);
      }
      const { rowCount } = await postgres.query(
        `UPDATE ${tableName} SET is_active = false WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      return rowCount > 0;
    } catch (error) {
      console.error('[CustomerAPI] delete failed:', error);
      return false;
    }
  },

  /**
   * Add loyalty points
   */
  async addPoints(id: string, pointsToAdd: number): Promise<boolean> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const cur = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: 'points',
            id: `eq.${id}`,
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            limit: 1,
          },
          { schema: 'public' }
        );
        const row = Array.isArray(cur) ? cur[0] : null;
        if (!row) return false;
        const next = Number(row.points || 0) + Number(pointsToAdd);
        const patched = await postgrest.patch<any[]>(
          `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`,
          { points: next },
          { schema: 'public', prefer: 'return=representation' }
        );
        const u = Array.isArray(patched) ? patched[0] : patched;
        return Boolean(u);
      }
      const { rowCount } = await postgres.query(
        `UPDATE ${tableName} SET points = points + $1 WHERE id = $2 AND firm_nr = $3`,
        [pointsToAdd, id, ERP_SETTINGS.firmNr]
      );
      return rowCount > 0;
    } catch (error) {
      console.error('[CustomerAPI] addPoints failed:', error);
      return false;
    }
  },

  /**
   * Add balance to customer
   */
  async addBalance(id: string, amount: number): Promise<boolean> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const cur = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: 'balance',
            id: `eq.${id}`,
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            limit: 1,
          },
          { schema: 'public' }
        );
        const row = Array.isArray(cur) ? cur[0] : null;
        if (!row) return false;
        const next = Number(row.balance ?? 0) + Number(amount);
        const patched = await postgrest.patch<any[]>(
          `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`,
          { balance: next },
          { schema: 'public', prefer: 'return=representation' }
        );
        const u = Array.isArray(patched) ? patched[0] : patched;
        return Boolean(u);
      }
      // We assume balance column exists after migration. 
      // If not, this might fail or we should catch it.
      // Ideally we check column existence or use a safe update if possible, but standard is strict schema.
      const { rowCount } = await postgres.query(
        `UPDATE ${tableName} SET balance = COALESCE(balance, 0) + $1 WHERE id = $2 AND firm_nr = $3`,
        [amount, id, ERP_SETTINGS.firmNr]
      );

      // Also log this transaction? For now just return true.
      return rowCount > 0;
    } catch (error) {
      console.error('[CustomerAPI] addBalance failed:', error);
      return false;
    }
  },
};

/**
 * Helper: Map database customer
 */
function mapDatabaseCustomerToCustomer(dbCustomer: any): Customer {
  return {
    id: dbCustomer.id,
    code: dbCustomer.code,
    name: dbCustomer.name,
    phone: dbCustomer.phone,
    phone2: dbCustomer.phone2 || undefined,
    email: dbCustomer.email,
    address: dbCustomer.address,
    notes: dbCustomer.notes || undefined,
    call_plan_enabled: dbCustomer.call_plan_enabled === true,
    call_plan_weekdays: Array.isArray(dbCustomer.call_plan_weekdays)
      ? dbCustomer.call_plan_weekdays.map(Number).filter((n: number) => Number.isFinite(n))
      : [],
    call_plan_note: dbCustomer.call_plan_note || undefined,
    call_last_status: dbCustomer.call_last_status || undefined,
    call_last_note: dbCustomer.call_last_note || undefined,
    call_last_at: dbCustomer.call_last_at || undefined,
    age: dbCustomer.age != null ? Number(dbCustomer.age) : undefined,
    file_id: dbCustomer.file_id != null && String(dbCustomer.file_id).trim() !== ''
      ? String(dbCustomer.file_id).trim()
      : undefined,
    occupation: dbCustomer.occupation || undefined,
    gender: dbCustomer.gender || undefined,
    customer_tier: dbCustomer.customer_tier || undefined,
    heard_from: dbCustomer.heard_from || undefined,
    points: dbCustomer.points || 0,
    totalSpent: parseFloat(dbCustomer.total_spent || 0),
    balance: parseFloat(dbCustomer.balance || 0),
    taxNumber: dbCustomer.tax_nr || dbCustomer.tax_number,
    taxOffice: dbCustomer.tax_office,
    company: dbCustomer.company,
    is_active: dbCustomer.is_active,
    totalPurchases: 0,
  };
}



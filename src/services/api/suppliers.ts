/**
 * Supplier API - Direct PostgreSQL Implementation
 * Note: Uses rex_{firm}_customers table (Logo ERP CLCARD equivalent)
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import type { Supplier } from '../../core/types';
export type { Supplier };

function accountNamesMatch(stored: string | null | undefined, expected: string): boolean {
  const a = String(stored || '').trim().toLocaleUpperCase('tr-TR');
  const b = String(expected || '').trim().toLocaleUpperCase('tr-TR');
  return a.length > 0 && b.length > 0 && a === b;
}

function dedupeEkstreRows(rows: any[]): any[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.fiche_no ?? ''}|${r.date ?? ''}|${r.fiche_type ?? ''}|${r.total_amount ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapSalesRowToEkstre(r: any) {
  return {
    fiche_no: r.fiche_no,
    date: r.date,
    trcode: r.trcode,
    fiche_type: r.fiche_type,
    total_amount: r.net_amount,
    currency: r.currency,
    notes: r.notes,
  };
}

function mapCashRowToEkstre(r: any) {
  return {
    fiche_no: r.fiche_no,
    date: r.date,
    trcode: 0,
    fiche_type: r.transaction_type,
    total_amount: r.amount,
    currency: r.currency_code,
    notes: r.definition,
  };
}

export const supplierAPI = {
  /**
   * Get all suppliers
   */
  async getAll(): Promise<Supplier[]> {
    try {
      const custTable = `rex_${ERP_SETTINGS.firmNr}_customers`;
      const suppTable = `rex_${ERP_SETTINGS.firmNr}_suppliers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const safeGet = async (path: string, query: Record<string, string>) => {
          try {
            const rows = await postgrest.get<any[]>(path, query, { schema: 'public' });
            return Array.isArray(rows) ? rows : [];
          } catch (err) {
            console.warn('[SupplierAPI] PostgREST getAll fallback:', path, err);
            return [] as any[];
          }
        };
        const [customers, suppliers] = await Promise.all([
          safeGet(
            `/${custTable}`,
            {
              select: '*',
              firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
              is_active: 'eq.true',
              order: 'name.asc',
            }
          ),
          safeGet(
            `/${suppTable}`,
            {
              select: '*',
              is_active: 'eq.true',
              order: 'name.asc',
            }
          ),
        ]);
        const customerRows = (Array.isArray(customers) ? customers : []).map((r) => ({
          ...r,
          card_type: 'customer',
        }));
        const supplierRows = (Array.isArray(suppliers) ? suppliers : []).map((r) => ({
          ...r,
          card_type: 'supplier',
        }));
        return [...customerRows, ...supplierRows]
          .map(mapDatabaseSupplierToSupplier)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      }

      const sql = `
        WITH account_balances AS (
          /* Müşteri bakiyesi = ekstre (getAccountStatement) ile aynı kaynaklar ve SupplierModule işaret kuralları:
             - sales: iade hariç tüm fiş türleri (alış, satış, irsaliye, sipariş, hizmet…) +net_amount; iade -net_amount
             - kasa: CH_ODEME ve CH_TAHSILAT her ikisi de cari alacağı artırır → -amount */
          SELECT customer_id AS id, SUM(line_contrib) AS calculated_balance
          FROM (
            SELECT customer_id,
              CASE WHEN fiche_type = 'return_invoice' THEN -net_amount ELSE net_amount END AS line_contrib
            FROM sales
            WHERE customer_id IS NOT NULL
              AND COALESCE(is_cancelled, false) = false
            UNION ALL
            SELECT customer_id, -amount AS line_contrib
            FROM cash_lines
            WHERE transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
          ) customer_tx
          GROUP BY customer_id
        )
        SELECT 
          c.id, c.code, c.name, c.phone, c.email, c.address, c.city, 
          COALESCE(b.calculated_balance, 0) as balance, 
          c.is_active, c.created_at, 'customer' as card_type 
        FROM ${custTable} c
        LEFT JOIN account_balances b ON c.id = b.id
        WHERE c.firm_nr = $1 AND c.is_active = true
        
        UNION ALL
        
        SELECT 
          s.id, s.code, s.name, s.phone, s.email, s.address, s.city, 
          COALESCE(b.calculated_balance, 0) as balance, 
          s.is_active, s.created_at, 'supplier' as card_type 
        FROM ${suppTable} s
        LEFT JOIN (
          /* Tedarikçi: ekstre ile uyum — alış/irsaliye/sipariş vb. -net; iade +net; kasa CH ikisi +amount */
          SELECT customer_id AS id, SUM(line_contrib) AS calculated_balance
          FROM (
            SELECT customer_id,
              CASE WHEN fiche_type = 'return_invoice' THEN net_amount ELSE -net_amount END AS line_contrib
            FROM sales
            WHERE customer_id IS NOT NULL
              AND COALESCE(is_cancelled, false) = false
            UNION ALL
            SELECT customer_id, amount AS line_contrib
            FROM cash_lines
            WHERE transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
          ) supplier_tx
          GROUP BY customer_id
        ) b ON s.id = b.id
        WHERE s.is_active = true
        ORDER BY name ASC`;

      const { rows } = await postgres.query(sql, [ERP_SETTINGS.firmNr]);
      return rows.map(mapDatabaseSupplierToSupplier);
    } catch (error) {
      console.error('[SupplierAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Get supplier by ID
   */
  async getById(id: string): Promise<Supplier | null> {
    try {
      const custTable = `rex_${ERP_SETTINGS.firmNr}_customers`;
      const suppTable = `rex_${ERP_SETTINGS.firmNr}_suppliers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const custRows = await postgrest.get<any[]>(
          `/${custTable}`,
          {
            select: '*',
            id: `eq.${id}`,
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            limit: 1,
          },
          { schema: 'public' }
        );
        if (Array.isArray(custRows) && custRows[0]) {
          return mapDatabaseSupplierToSupplier({ ...custRows[0], card_type: 'customer' });
        }
        const supRows = await postgrest.get<any[]>(
          `/${suppTable}`,
          { select: '*', id: `eq.${id}`, limit: 1 },
          { schema: 'public' }
        );
        if (Array.isArray(supRows) && supRows[0]) {
          return mapDatabaseSupplierToSupplier({ ...supRows[0], card_type: 'supplier' });
        }
        return null;
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${custTable} WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      return rows[0] ? mapDatabaseSupplierToSupplier(rows[0]) : null;
    } catch (error) {
      console.error('[SupplierAPI] getById failed:', error);
      return null;
    }
  },

  /**
   * Get supplier by code
   */
  async getByCode(code: string): Promise<Supplier | null> {
    try {
      const custTable = `rex_${ERP_SETTINGS.firmNr}_customers`;
      const suppTable = `rex_${ERP_SETTINGS.firmNr}_suppliers`;
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const custRows = await postgrest.get<any[]>(
          `/${custTable}`,
          {
            select: '*',
            code: `eq.${code}`,
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            limit: 1,
          },
          { schema: 'public' }
        );
        if (Array.isArray(custRows) && custRows[0]) {
          return mapDatabaseSupplierToSupplier({ ...custRows[0], card_type: 'customer' });
        }
        const supRows = await postgrest.get<any[]>(
          `/${suppTable}`,
          { select: '*', code: `eq.${code}`, limit: 1 },
          { schema: 'public' }
        );
        if (Array.isArray(supRows) && supRows[0]) {
          return mapDatabaseSupplierToSupplier({ ...supRows[0], card_type: 'supplier' });
        }
        return null;
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${custTable} WHERE code = $1 AND firm_nr = $2`,
        [code, ERP_SETTINGS.firmNr]
      );
      return rows[0] ? mapDatabaseSupplierToSupplier(rows[0]) : null;
    } catch (error) {
      console.error('[SupplierAPI] getByCode failed:', error);
      return null;
    }
  },

  /**
   * Create new account (Customer or Supplier)
   */
  async create(account: Omit<Supplier, 'id'>): Promise<Supplier> {
    try {
      const isSupplier = account.cardType === 'supplier';
      const tableName = isSupplier
        ? `rex_${ERP_SETTINGS.firmNr}_suppliers`
        : `rex_${ERP_SETTINGS.firmNr}_customers`;

      const columns = [
        'code', 'name', 'phone', 'email', 'address', 'city',
        'tax_nr', 'tax_office', 'is_active'
      ];
      const values = [
        account.code, account.name, account.phone, account.email,
        account.address, account.city, account.tax_number,
        account.tax_office, true
      ];

      // Her iki tablo da firm_nr NOT NULL gerektirir
      columns.push('firm_nr');
      values.push(ERP_SETTINGS.firmNr);

      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const body: Record<string, unknown> = {
          code: account.code,
          name: account.name,
          phone: account.phone,
          email: account.email,
          address: account.address,
          city: account.city,
          tax_nr: account.tax_number,
          tax_office: account.tax_office,
          is_active: true,
          firm_nr: ERP_SETTINGS.firmNr,
        };
        const rows = await postgrest.post<any[]>(
          `/${tableName}`,
          body,
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return { ...mapDatabaseSupplierToSupplier(row), cardType: account.cardType };
      }

      const { rows } = await postgres.query(
        `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );

      return { ...mapDatabaseSupplierToSupplier(rows[0]), cardType: account.cardType };
    } catch (error: any) {
      console.error('[SupplierAPI] create failed:', error);
      throw new Error(error.message || 'Cari hesap oluşturulamadı');
    }
  },

  /**
   * Update account
   */
  async update(id: string, account: Partial<Supplier>): Promise<Supplier> {
    try {
      const isSupplier = account.cardType === 'supplier';
      const tableName = isSupplier
        ? `rex_${ERP_SETTINGS.firmNr}_suppliers`
        : `rex_${ERP_SETTINGS.firmNr}_customers`;

      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      Object.entries(account).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined && key !== 'created_at' && key !== 'updated_at' && key !== 'cardType') {
          const dbKey = key === 'tax_number' ? 'tax_nr' : key;
          fields.push(`${dbKey} = $${i++}`);
          values.push(value);
        }
      });

      if (fields.length === 0) throw new Error('No fields to update');

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const patchBody: Record<string, unknown> = {};
        const skipKeys = new Set(['id', 'cardType', 'created_at', 'updated_at']);
        Object.entries(account).forEach(([key, value]) => {
          if (skipKeys.has(key) || value === undefined) return;
          let col = key === 'tax_number' || key === 'taxNumber' ? 'tax_nr' : key;
          if (key === 'tax_office' || key === 'taxOffice') col = 'tax_office';
          patchBody[col] = value;
        });
        if (Object.keys(patchBody).length === 0) throw new Error('No fields to update');
        const path = isSupplier
          ? `/${tableName}?id=eq.${encodeURIComponent(id)}`
          : `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`;
        const rows = await postgrest.patch<any[]>(path, patchBody, {
          schema: 'public',
          prefer: 'return=representation',
        });
        const row = Array.isArray(rows) ? rows[0] : rows;
        return { ...mapDatabaseSupplierToSupplier(row), cardType: account.cardType };
      }

      values.push(id);

      let query = `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${i}`;

      // Customers table needs firm_nr check
      if (!isSupplier) {
        values.push(ERP_SETTINGS.firmNr);
        query += ` AND firm_nr = $${i + 1}`;
      }

      const { rows } = await postgres.query(query + ' RETURNING *', values);
      return { ...mapDatabaseSupplierToSupplier(rows[0]), cardType: account.cardType };
    } catch (error: any) {
      console.error('[SupplierAPI] update failed:', error);
      throw new Error(error.message || 'Cari hesap güncellenemedi');
    }
  },

  /**
   * Delete account
   */
  async delete(id: string, cardType: 'customer' | 'supplier'): Promise<void> {
    try {
      const isSupplier = cardType === 'supplier';
      const tableName = isSupplier
        ? `rex_${ERP_SETTINGS.firmNr}_suppliers`
        : `rex_${ERP_SETTINGS.firmNr}_customers`;

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const path = isSupplier
          ? `/${tableName}?id=eq.${encodeURIComponent(id)}`
          : `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(String(ERP_SETTINGS.firmNr))}`;
        await postgrest.patch(path, { is_active: false }, { schema: 'public', prefer: 'return=minimal' });
        return;
      }

      let query = `UPDATE ${tableName} SET is_active = false WHERE id = $1`;
      const params = [id];

      if (!isSupplier) {
        query += ` AND firm_nr = $2`;
        params.push(ERP_SETTINGS.firmNr);
      }

      await postgres.query(query, params);
    } catch (error: any) {
      console.error('[SupplierAPI] delete failed:', error);
      throw new Error(error.message || 'Cari hesap silinemedi');
    }
  },

  /**
   * Get account statement (ekstresi) for a customer/supplier
   */
  async getAccountStatement(
    accountId: string,
    startDate?: string,
    endDate?: string,
    accountName?: string
  ): Promise<any[]> {
    try {
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const fn = String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0');
        const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
        const salesPath = `/rex_${fn}_${pn}_sales`;
        const cashPath = `/rex_${fn}_${pn}_cash_lines`;

        const salesByIdQuery: Record<string, string> = {
          select: 'fiche_no,date,trcode,fiche_type,net_amount,currency,notes',
          customer_id: `eq.${accountId}`,
          order: 'date.asc',
        };
        if (startDate && endDate) {
          salesByIdQuery.and = `(date.gte.${startDate},date.lte.${endDate})`;
        } else if (startDate) {
          salesByIdQuery.date = `gte.${startDate}`;
        } else if (endDate) {
          salesByIdQuery.date = `lte.${endDate}`;
        }

        const cashByIdQuery: Record<string, string> = {
          select: 'fiche_no,date,transaction_type,amount,currency_code,definition',
          customer_id: `eq.${accountId}`,
          transaction_type: 'in.(CH_ODEME,CH_TAHSILAT)',
          order: 'date.asc',
        };
        if (startDate && endDate) {
          cashByIdQuery.and = `(date.gte.${startDate},date.lte.${endDate})`;
        } else if (startDate) {
          cashByIdQuery.date = `gte.${startDate}`;
        } else if (endDate) {
          cashByIdQuery.date = `lte.${endDate}`;
        }

        const nameTrim = String(accountName || '').trim();
        const nameSalesQuery: Record<string, string> | null = nameTrim
          ? {
              select: 'fiche_no,date,trcode,fiche_type,net_amount,currency,notes,customer_id,customer_name',
              customer_name: `ilike.${nameTrim}`,
              order: 'date.asc',
            }
          : null;
        if (nameSalesQuery) {
          if (startDate && endDate) {
            nameSalesQuery.and = `(date.gte.${startDate},date.lte.${endDate})`;
          } else if (startDate) {
            nameSalesQuery.date = `gte.${startDate}`;
          } else if (endDate) {
            nameSalesQuery.date = `lte.${endDate}`;
          }
        }

        const fetches: Promise<any[]>[] = [
          postgrest.get<any[]>(salesPath, salesByIdQuery, { schema: 'public' }).catch(() => [] as any[]),
          postgrest.get<any[]>(cashPath, cashByIdQuery, { schema: 'public' }).catch(() => [] as any[]),
        ];
        if (nameSalesQuery) {
          fetches.push(
            postgrest.get<any[]>(salesPath, nameSalesQuery, { schema: 'public' }).catch(() => [] as any[])
          );
        }
        const [saleRows, cashRows, nameSaleRows = []] = await Promise.all(fetches);

        const accountIdStr = String(accountId || '');
        const byIdSales = (Array.isArray(saleRows) ? saleRows : []).map(mapSalesRowToEkstre);
        const byNameSales = (Array.isArray(nameSaleRows) ? nameSaleRows : [])
          .filter((r) => {
            if (!accountNamesMatch(r.customer_name, nameTrim)) return false;
            const cid = r.customer_id ? String(r.customer_id) : '';
            return !cid || cid !== accountIdStr;
          })
          .map(mapSalesRowToEkstre);
        const fromCash = (Array.isArray(cashRows) ? cashRows : []).map(mapCashRowToEkstre);
        return dedupeEkstreRows([...byIdSales, ...byNameSales, ...fromCash]).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
      }

      // Ekstresi = faturalar (sales) + kasa işlemleri (cash_lines)
      // Both halves of the UNION share the same $1/$2/$3 parameters
      const nameTrim = String(accountName || '').trim();
      const values: any[] = [accountId, nameTrim || null];
      let dateFilter = '';
      let i = 3;
      if (startDate) { dateFilter += ` AND t.date::date >= $${i++}::date`; values.push(startDate); }
      if (endDate) { dateFilter += ` AND t.date::date <= $${i++}::date`; values.push(endDate); }

      const accountMatch = `(
        t.customer_id::text = $1::text
        OR (
          $2::text IS NOT NULL AND TRIM($2::text) <> ''
          AND TRIM(t.customer_name) ILIKE TRIM($2::text)
          AND (t.customer_id IS NULL OR t.customer_id::text <> $1::text)
        )
      )`;
      const activeOnly = `COALESCE(t.is_cancelled, false) = false`;

      const sql = `
        SELECT fiche_no, date, trcode, fiche_type, net_amount AS total_amount, currency, notes
        FROM sales t
        WHERE ${activeOnly} AND ${accountMatch}${dateFilter}
        UNION ALL
        SELECT fiche_no, date, 0 AS trcode, transaction_type AS fiche_type,
               amount AS total_amount, currency_code AS currency, definition AS notes
        FROM cash_lines t
        WHERE ${accountMatch}${dateFilter}
          AND t.transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
        ORDER BY date ASC`;

      const { rows } = await postgres.query(sql, values);
      return dedupeEkstreRows(rows);
    } catch (error: any) {
      console.error('[SupplierAPI] getAccountStatement failed:', error);
      throw new Error(error?.message || 'Hesap ekstresi yüklenemedi');
    }
  },

  /**
   * Generate next code
   */
  async generateCode(cardType: 'customer' | 'supplier'): Promise<string> {
    try {
      const isSupplier = cardType === 'supplier';
      const tableName = isSupplier
        ? `rex_${ERP_SETTINGS.firmNr}_suppliers`
        : `rex_${ERP_SETTINGS.firmNr}_customers`;

      const prefix = isSupplier ? 'TED-' : 'MUS-';

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const likePat = `${prefix}*`;
        const q: Record<string, string> = {
          select: 'code',
          code: `like.${likePat}`,
          order: 'created_at.desc',
          limit: '1',
        };
        if (!isSupplier) {
          q.firm_nr = `eq.${ERP_SETTINGS.firmNr}`;
        }
        const rows = await postgrest.get<any[]>(`/${tableName}`, q, { schema: 'public' });
        if (!Array.isArray(rows) || rows.length === 0) return `${prefix}001`;
        const lastCode = rows[0].code;
        const numPart = parseInt(String(lastCode).replace(prefix, ''), 10);
        if (Number.isNaN(numPart)) return `${prefix}${Date.now().toString().slice(-4)}`;
        return `${prefix}${(numPart + 1).toString().padStart(3, '0')}`;
      }

      let query = `SELECT code FROM ${tableName} WHERE code LIKE $1`;
      const params = [`${prefix}%`];

      if (!isSupplier) {
        query += ` AND firm_nr = $2`;
        params.push(ERP_SETTINGS.firmNr);
      }

      query += ` ORDER BY created_at DESC LIMIT 1`;

      const { rows } = await postgres.query(query, params);

      if (rows.length === 0) return `${prefix}001`;

      const lastCode = rows[0].code;
      const numPart = parseInt(lastCode.replace(prefix, ''));
      if (isNaN(numPart)) return `${prefix}${Date.now().toString().slice(-4)}`;

      return `${prefix}${(numPart + 1).toString().padStart(3, '0')}`;
    } catch (error) {
      console.error('[SupplierAPI] generateCode failed:', error);
      return `AC-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    }
  }
};

/**
 * Helper: Map database customer record to Supplier type
 */
function mapDatabaseSupplierToSupplier(dbSupplier: any): Supplier {
  return {
    id: dbSupplier.id,
    code: dbSupplier.code,
    name: dbSupplier.name,
    phone: dbSupplier.phone,
    phone2: dbSupplier.phone2,
    email: dbSupplier.email,
    address: dbSupplier.address,
    district: dbSupplier.district,
    city: dbSupplier.city,
    postal_code: dbSupplier.postal_code,
    country: dbSupplier.country,
    contact_person: dbSupplier.contact_person,
    contact_person_phone: dbSupplier.contact_person_phone,
    payment_terms: dbSupplier.payment_terms || 30,
    credit_limit: parseFloat(dbSupplier.credit_limit || 0),
    balance: parseFloat(dbSupplier.balance || 0),
    tax_number: dbSupplier.tax_nr || dbSupplier.tax_number,
    tax_office: dbSupplier.tax_office,
    is_active: dbSupplier.is_active !== false,
    notes: dbSupplier.notes,
    firma_id: dbSupplier.firma_id,
    created_at: dbSupplier.created_at,
    updated_at: dbSupplier.updated_at,
    cardType: dbSupplier.card_type as 'customer' | 'supplier',
  };
}

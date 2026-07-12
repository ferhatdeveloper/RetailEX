/**
 * Supplier API - Direct PostgreSQL Implementation
 * Note: Uses rex_{firm}_customers table (Logo ERP CLCARD equivalent)
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import type { Supplier } from '../../core/types';
import {
  firmCustomersTable,
  firmSuppliersTable,
  sqlCustomerAccountBalancesCte,
  sqlSupplierAccountBalancesCte,
  sqlResolvedCustomerBalanceExpr,
  sqlResolvedSupplierBalanceExpr,
  computeCustomerBalanceFromLedger,
  computeSupplierBalanceFromLedger,
  normalizeFirmTableNr,
  accountLedgerNameMatch,
} from './accountBalance';
import { buildCariDbPayload } from './cariAccountFields';
import { filterSupplierRowsHiddenByCustomerCode, resolveCanonicalCariAccountId } from './cariAccountResolve';
import {
  paymentMethodImpliesCustomerDebt,
  paymentMethodImpliesSupplierDebt,
} from '../../utils/paymentMethodUtils';
export type { Supplier };

export type CariListFilter = 'all' | 'customer' | 'supplier';

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
  const cancelled = r.is_cancelled === true || String(r.fiche_type || '').toLowerCase() === 'cancelled';
  return {
    fiche_no: r.fiche_no,
    date: r.date,
    trcode: r.trcode,
    fiche_type: r.fiche_type,
    total_amount: r.net_amount,
    currency: r.currency,
    notes: r.notes,
    is_cancelled: cancelled,
  };
}

function mapCashRowToEkstre(r: any) {
  return {
    fiche_no: r.fiche_no,
    date: r.date,
    trcode: 0,
    fiche_type: String(r.transaction_type || '').trim().toUpperCase(),
    total_amount: Math.abs(parseFloat(String(r.amount ?? 0)) || 0),
    currency: r.currency_code,
    notes: r.definition,
  };
}

/** Tedarikçi ekstresi: alış + alış iade; müşteri ekstresi: veresiye satış + iade (peşin hariç) */
function isCariEkstreSaleRow(
  row: { fiche_type?: string | null; payment_method?: string | null },
  cardType?: 'customer' | 'supplier',
): boolean {
  const ft = String(row.fiche_type || '').toLowerCase();
  if (cardType === 'supplier') {
    if (ft === 'return_invoice' || ft === 'opening_balance') return true;
    if (ft !== 'purchase_invoice') return false;
    return paymentMethodImpliesSupplierDebt(row.payment_method);
  }
  if (cardType === 'customer') {
    if (ft === 'return_invoice' || ft === 'opening_balance') return true;
    if (ft !== 'sales_invoice' && ft !== 'service' && ft !== 'hizmet') return false;
    return paymentMethodImpliesCustomerDebt(row.payment_method);
  }
  return true;
}

export const supplierAPI = {
  /**
   * Get all suppliers
   */
  async getAll(options?: { cardType?: CariListFilter }): Promise<Supplier[]> {
    const cardFilter = options?.cardType ?? 'all';
    try {
      const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
      const custTable = firmCustomersTable(firmNr);
      const suppTable = firmSuppliersTable(firmNr);
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
        const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
        const salesPath = `/rex_${firmNr}_${pn}_sales`;
        const cashPath = `/rex_${firmNr}_${pn}_cash_lines`;
        const [customers, suppliers, salesRows, cashRows] = await Promise.all([
          safeGet(
            `/${custTable}`,
            {
              select: '*',
              firm_nr: `eq.${firmNr}`,
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
          safeGet(salesPath, {
            select: 'customer_id,customer_name,net_amount,fiche_type,is_cancelled,payment_method',
            is_cancelled: 'eq.false',
            limit: '10000',
          }),
          safeGet(cashPath, {
            select: 'customer_id,amount,transaction_type',
            transaction_type: 'in.(CH_ODEME,CH_TAHSILAT)',
            limit: '50000',
          }),
        ]);
        const sales = Array.isArray(salesRows) ? salesRows : [];
        const cash = Array.isArray(cashRows) ? cashRows : [];
        const customerList = Array.isArray(customers) ? customers : [];
        const supplierList = filterSupplierRowsHiddenByCustomerCode(
          Array.isArray(suppliers) ? suppliers : [],
          customerList,
        );
        const customerRows = customerList.map((r) => ({
          ...r,
          card_type: 'customer',
          balance: computeCustomerBalanceFromLedger(
            String(r.id),
            String(r.name || ''),
            sales,
            cash,
            parseFloat(String(r.balance ?? 0)) || 0,
          ),
        }));
        const supplierRows = supplierList.map((r) => ({
          ...r,
          card_type: 'supplier',
          balance: computeSupplierBalanceFromLedger(
            String(r.id),
            String(r.name || ''),
            sales,
            cash,
            parseFloat(String(r.balance ?? 0)) || 0,
          ),
        }));
        return [...customerRows, ...supplierRows]
          .map(mapDatabaseSupplierToSupplier)
          .filter((row) => {
            if (cardFilter === 'all') return true;
            return row.cardType === cardFilter;
          })
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      }

      const sql = `
        WITH ${sqlCustomerAccountBalancesCte(custTable, '$1::text')},
        ${sqlSupplierAccountBalancesCte(suppTable)}
        SELECT
          c.id, c.ref_id, c.code, c.name, c.phone, c.phone2, c.email,
          c.address, c.city, c.district, c.neighborhood,
          c.tax_nr, c.tax_office, c.notes,
          c.payment_terms::text AS payment_terms, COALESCE(c.credit_limit, 0) AS credit_limit,
          NULL::varchar AS contact_person, NULL::varchar AS contact_person_phone,
          c.age, c.file_id, c.occupation, c.gender, c.customer_tier, c.heard_from,
          c.points, c.total_spent,
          c.call_plan_enabled, c.call_plan_weekdays, c.call_plan_note,
          c.call_last_status, c.call_last_note, c.call_last_at,
          ${sqlResolvedCustomerBalanceExpr('c')} as balance,
          c.is_active, c.created_at, 'customer' as card_type
        FROM ${custTable} c
        LEFT JOIN account_balances b ON c.id = b.id
        WHERE c.firm_nr = $1 AND c.is_active = true

        UNION ALL

        SELECT
          s.id, s.ref_id, s.code, s.name, s.phone, NULL::varchar AS phone2, s.email,
          s.address, s.city, s.district, s.neighborhood,
          s.tax_nr, s.tax_office, s.notes,
          s.payment_terms::text AS payment_terms, COALESCE(s.credit_limit, 0) AS credit_limit,
          s.contact_person, s.contact_person_phone,
          NULL::integer AS age, NULL::varchar AS file_id, NULL::varchar AS occupation,
          NULL::varchar AS gender, NULL::varchar AS customer_tier, NULL::varchar AS heard_from,
          NULL::numeric AS points, NULL::numeric AS total_spent,
          false AS call_plan_enabled, ARRAY[]::smallint[] AS call_plan_weekdays, NULL::text AS call_plan_note,
          NULL::varchar AS call_last_status, NULL::text AS call_last_note, NULL::timestamptz AS call_last_at,
          ${sqlResolvedSupplierBalanceExpr('s')} as balance,
          s.is_active, s.created_at, 'supplier' as card_type
        FROM ${suppTable} s
        LEFT JOIN supplier_balances b ON s.id = b.id
        WHERE s.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM ${custTable} c2
            WHERE c2.firm_nr = $1::text
              AND (
                (
                  UPPER(TRIM(COALESCE(c2.code, ''))) = UPPER(TRIM(COALESCE(s.code, '')))
                  AND TRIM(COALESCE(c2.code, '')) <> ''
                )
                OR (
                  TRIM(LOWER(COALESCE(c2.name, ''))) = TRIM(LOWER(COALESCE(s.name, '')))
                  AND TRIM(COALESCE(c2.name, '')) <> ''
                )
              )
          )
        ORDER BY name ASC`;

      const { rows } = await postgres.query(sql, [firmNr], {
        firmNr,
        periodNr: ERP_SETTINGS.periodNr,
      });
      return rows.map(mapDatabaseSupplierToSupplier).filter((row) => {
        if (cardFilter === 'all') return true;
        return row.cardType === cardFilter;
      });
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
          const canon = await resolveCanonicalCariAccountId(id);
          if (canon.cardType === 'customer' && canon.id !== id) {
            const custCanon = await postgrest.get<any[]>(
              `/${custTable}`,
              {
                select: '*',
                id: `eq.${canon.id}`,
                firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
                limit: 1,
              },
              { schema: 'public' },
            );
            if (Array.isArray(custCanon) && custCanon[0]) {
              return mapDatabaseSupplierToSupplier({ ...custCanon[0], card_type: 'customer' });
            }
          }
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
      if (!isSupplier) {
        columns.push('call_plan_enabled', 'call_plan_weekdays', 'call_plan_note', 'call_last_status', 'call_last_note', 'call_last_at');
        values.push(
          account.call_plan_enabled === true,
          account.call_plan_enabled === true ? account.call_plan_weekdays ?? [] : [],
          account.call_plan_note || null,
          account.call_last_status || 'planned',
          account.call_last_note || null,
          account.call_last_at || null,
        );
      }

      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const body = buildCariDbPayload(
          {
            code: account.code,
            name: account.name,
            phone: account.phone,
            email: account.email,
            address: account.address,
            city: account.city,
            tax_number: account.tax_number,
            tax_office: account.tax_office,
            notes: account.notes,
            payment_terms: account.payment_terms,
            credit_limit: account.credit_limit,
            firm_nr: ERP_SETTINGS.firmNr,
          },
          isSupplier ? 'supplier' : 'customer',
          { forceActive: true },
        );
        body.firm_nr = ERP_SETTINGS.firmNr;
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

      const patchFields = buildCariDbPayload(account as Record<string, unknown>, isSupplier ? 'supplier' : 'customer');
      Object.entries(patchFields).forEach(([dbKey, value]) => {
        fields.push(`${dbKey} = $${i++}`);
        values.push(value);
      });

      if (fields.length === 0) throw new Error('No fields to update');

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const patchBody = buildCariDbPayload(account as Record<string, unknown>, isSupplier ? 'supplier' : 'customer');
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
   * Müşteri ↔ tedarikçi tip değişimi (yeni kart + eski pasif + fiş customer_id taşıma)
   */
  async transferCardType(
    id: string,
    fromType: 'customer' | 'supplier',
    toType: 'customer' | 'supplier',
    account: Partial<Supplier>,
  ): Promise<Supplier> {
    if (fromType === toType) {
      return this.update(id, { ...account, cardType: toType });
    }

    const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
    const fromTable = fromType === 'supplier' ? firmSuppliersTable(firmNr) : firmCustomersTable(firmNr);
    const toTable = toType === 'supplier' ? firmSuppliersTable(firmNr) : firmCustomersTable(firmNr);
    const queryOpts = { firmNr, periodNr: ERP_SETTINGS.periodNr };

    let existing: Record<string, unknown> = {};
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const path =
        fromType === 'supplier'
          ? `/${fromTable}?id=eq.${encodeURIComponent(id)}&limit=1`
          : `/${fromTable}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firmNr)}&limit=1`;
      const rows = await postgrest.get<any[]>(path, { select: '*' }, { schema: 'public' });
      existing = Array.isArray(rows) && rows[0] ? rows[0] : {};
    } else {
      const sql =
        fromType === 'supplier'
          ? `SELECT * FROM ${fromTable} WHERE id = $1::uuid LIMIT 1`
          : `SELECT * FROM ${fromTable} WHERE id = $1::uuid AND firm_nr = $2::text LIMIT 1`;
      const params = fromType === 'supplier' ? [id] : [id, firmNr];
      const { rows } = await postgres.query(sql, params, queryOpts);
      existing = rows[0] || {};
    }

    const merged = {
      ...existing,
      code: account.code ?? existing.code,
      name: account.name ?? existing.name,
      phone: account.phone ?? existing.phone,
      email: account.email ?? existing.email,
      address: account.address ?? existing.address,
      city: account.city ?? existing.city,
      tax_number: account.tax_number ?? existing.tax_nr,
      tax_office: account.tax_office ?? existing.tax_office,
      notes: account.notes ?? existing.notes,
      call_plan_enabled: account.call_plan_enabled ?? existing.call_plan_enabled,
      call_plan_weekdays: account.call_plan_weekdays ?? existing.call_plan_weekdays,
      call_plan_note: account.call_plan_note ?? existing.call_plan_note,
      call_last_status: account.call_last_status ?? existing.call_last_status,
      call_last_note: account.call_last_note ?? existing.call_last_note,
      call_last_at: account.call_last_at ?? existing.call_last_at,
      payment_terms: account.payment_terms ?? existing.payment_terms,
      credit_limit: account.credit_limit ?? existing.credit_limit,
      cardType: toType,
    };

    const created = await this.create(merged as Omit<Supplier, 'id'>);
    const newId = String(created.id);

    try {
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
        const salesPath = `/rex_${firmNr}_${pn}_sales?customer_id=eq.${encodeURIComponent(id)}`;
        await postgrest.patch(salesPath, { customer_id: newId }, { schema: 'public', prefer: 'return=minimal' }).catch(() => {});
        const cashPath = `/rex_${firmNr}_${pn}_cash_lines?customer_id=eq.${encodeURIComponent(id)}`;
        await postgrest.patch(cashPath, { customer_id: newId }, { schema: 'public', prefer: 'return=minimal' }).catch(() => {});
      } else {
        await postgres.query(
          `UPDATE sales SET customer_id = $1::uuid WHERE customer_id::text = $2::text`,
          [newId, id],
          queryOpts,
        );
        await postgres.query(
          `UPDATE cash_lines SET customer_id = $1::uuid WHERE customer_id::text = $2::text`,
          [newId, id],
          queryOpts,
        );
      }
    } catch (migrateErr) {
      console.warn('[SupplierAPI] transferCardType ledger migrate:', migrateErr);
    }

    await this.delete(id, fromType);
    return created;
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
    accountName?: string,
    cardType?: 'customer' | 'supplier',
  ): Promise<any[]> {
    try {
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const fn = String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0');
        const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
        const salesPath = `/rex_${fn}_${pn}_sales`;
        const cashPath = `/rex_${fn}_${pn}_cash_lines`;

        const salesByIdQuery: Record<string, string> = {
          select: 'fiche_no,date,trcode,fiche_type,net_amount,currency,notes,is_cancelled,customer_id,customer_name,payment_method',
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
              select: 'fiche_no,date,trcode,fiche_type,net_amount,currency,notes,customer_id,customer_name,is_cancelled,payment_method',
              customer_name: `not.is.null`,
              order: 'date.asc',
              limit: '5000',
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

        const safeFetch = async (path: string, q: Record<string, string>, label: string) => {
          try {
            const rows = await postgrest.get<any[]>(path, q, { schema: 'public' });
            return Array.isArray(rows) ? rows : [];
          } catch (err) {
            console.warn(`[SupplierAPI] getAccountStatement ${label}:`, err);
            return [] as any[];
          }
        };

        const fetches: Promise<any[]>[] = [
          safeFetch(salesPath, salesByIdQuery, 'salesById'),
          safeFetch(cashPath, cashByIdQuery, 'cashById'),
        ];
        if (nameSalesQuery) {
          fetches.push(safeFetch(salesPath, nameSalesQuery, 'salesByName'));
        }
        const [saleRows, cashRows, nameSaleRows = []] = await Promise.all(fetches);

        const accountIdStr = String(accountId || '');
        const filterEkstreSale = (r: any) =>
          isCariEkstreSaleRow(r, cardType) &&
          String(r?.fiche_type || '').toLowerCase() !== 'cancelled';
        const byIdSales = (Array.isArray(saleRows) ? saleRows : [])
          .filter(filterEkstreSale)
          .map(mapSalesRowToEkstre);
        const byNameSales = (Array.isArray(nameSaleRows) ? nameSaleRows : [])
          .filter((r) => {
            if (!filterEkstreSale(r)) return false;
            if (!accountLedgerNameMatch(r.customer_name, nameTrim)) return false;
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

      const accountMatchSales = `(
        t.customer_id::text = $1::text
        OR (
          $2::text IS NOT NULL AND TRIM($2::text) <> ''
          AND TRIM(LOWER(COALESCE(t.customer_name, ''))) = TRIM(LOWER($2::text))
          AND (t.customer_id IS NULL OR t.customer_id::text <> $1::text)
        )
      )`;

      const ledgerFicheFilter =
        cardType === 'supplier'
          ? ` AND t.fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance')
              AND (
                t.fiche_type IN ('return_invoice', 'opening_balance')
                OR NOT (
                  LOWER(TRIM(COALESCE(t.payment_method, ''))) IN ('cash', 'nakit', 'card', 'kart', 'gateway', 'havale', 'eft', 'haval', 'kredikarti', 'transfer')
                  OR LOWER(TRIM(COALESCE(t.payment_method, ''))) LIKE '%kredi%kart%'
                )
              )`
          : cardType === 'customer'
            ? ` AND t.fiche_type IN ('sales_invoice', 'return_invoice', 'service', 'hizmet', 'opening_balance')
              AND (
                t.fiche_type IN ('return_invoice', 'opening_balance')
                OR LOWER(TRIM(COALESCE(t.payment_method, ''))) IN (
                  'veresiye', 'open_account', 'cari', 'açık hesap', 'acik hesap',
                  'açık cari', 'acik cari', 'acik_cari', 'açık_cari'
                )
                OR LOWER(TRIM(COALESCE(t.payment_method, ''))) LIKE '%veresiye%'
              )`
            : '';

      const sql = `
        SELECT fiche_no, date, trcode, fiche_type, net_amount AS total_amount, currency, notes,
               COALESCE(is_cancelled, false) AS is_cancelled
        FROM sales t
        WHERE ${accountMatchSales}${ledgerFicheFilter}${dateFilter}
        UNION ALL
        SELECT fiche_no, date, 0 AS trcode, transaction_type AS fiche_type,
               ABS(amount) AS total_amount, currency_code AS currency, definition AS notes,
               false AS is_cancelled
        FROM cash_lines t
        WHERE t.customer_id::text = $1::text${dateFilter}
          AND UPPER(TRIM(t.transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
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
  const paymentRaw = dbSupplier.payment_terms;
  const paymentNum = typeof paymentRaw === 'number' ? paymentRaw : parseInt(String(paymentRaw ?? ''), 10);
  return {
    id: dbSupplier.id,
    code: dbSupplier.code,
    name: dbSupplier.name,
    phone: dbSupplier.phone,
    phone2: dbSupplier.phone2,
    email: dbSupplier.email,
    address: dbSupplier.address,
    district: dbSupplier.district,
    neighborhood: dbSupplier.neighborhood,
    city: dbSupplier.city,
    postal_code: dbSupplier.postal_code,
    country: dbSupplier.country,
    contact_person: dbSupplier.contact_person,
    contact_person_phone: dbSupplier.contact_person_phone,
    payment_terms: Number.isFinite(paymentNum) ? paymentNum : (paymentRaw ?? 30),
    credit_limit: parseFloat(dbSupplier.credit_limit || 0),
    balance: parseFloat(dbSupplier.balance || 0),
    points: dbSupplier.points != null ? parseFloat(String(dbSupplier.points)) || 0 : undefined,
    total_spent: dbSupplier.total_spent != null ? parseFloat(String(dbSupplier.total_spent)) || 0 : undefined,
    age: dbSupplier.age != null && dbSupplier.age !== '' ? Number(dbSupplier.age) : null,
    file_id: dbSupplier.file_id ?? null,
    gender: dbSupplier.gender ?? null,
    customer_tier: dbSupplier.customer_tier ?? null,
    occupation: dbSupplier.occupation ?? null,
    heard_from: dbSupplier.heard_from ?? null,
    tax_number: dbSupplier.tax_nr || dbSupplier.tax_number,
    tax_office: dbSupplier.tax_office,
    is_active: dbSupplier.is_active !== false,
    notes: dbSupplier.notes,
    call_plan_enabled: dbSupplier.call_plan_enabled === true,
    call_plan_weekdays: Array.isArray(dbSupplier.call_plan_weekdays)
      ? dbSupplier.call_plan_weekdays.map(Number).filter((n: number) => Number.isFinite(n))
      : [],
    call_plan_note: dbSupplier.call_plan_note || undefined,
    call_last_status: dbSupplier.call_last_status || undefined,
    call_last_note: dbSupplier.call_last_note || undefined,
    call_last_at: dbSupplier.call_last_at || undefined,
    ref_id: dbSupplier.ref_id != null ? Number(dbSupplier.ref_id) : null,
    firma_id: dbSupplier.firma_id,
    created_at: dbSupplier.created_at,
    updated_at: dbSupplier.updated_at,
    cardType: dbSupplier.card_type as 'customer' | 'supplier',
  };
}

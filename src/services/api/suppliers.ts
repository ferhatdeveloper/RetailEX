/**
 * Supplier API - Direct PostgreSQL Implementation
 * Note: Uses rex_{firm}_customers table (Logo ERP CLCARD equivalent)
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import type { Supplier } from '../../core/types';
export type { Supplier };

export const supplierAPI = {
  /**
   * Get all suppliers
   */
  async getAll(): Promise<Supplier[]> {
    try {
      const custTable = `rex_${ERP_SETTINGS.firmNr}_customers`;
      const suppTable = `rex_${ERP_SETTINGS.firmNr}_suppliers`;

      const { rows } = await postgres.query(
        `SELECT id, code, name, phone, email, address, city, balance, is_active, created_at, 'customer' as card_type FROM ${custTable} WHERE firm_nr = $1 AND is_active = true
         UNION ALL
         SELECT id, code, name, phone, email, address, city, balance, is_active, created_at, 'supplier' as card_type FROM ${suppTable} WHERE is_active = true
         ORDER BY name ASC`,
        [ERP_SETTINGS.firmNr]
      );
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
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND firm_nr = $2`,
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
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE code = $1 AND firm_nr = $2`,
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

      // Customers table has firm_nr column
      if (!isSupplier) {
        columns.push('firm_nr');
        values.push(ERP_SETTINGS.firmNr);
      }

      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

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
   * Generate next code
   */
  async generateCode(cardType: 'customer' | 'supplier'): Promise<string> {
    try {
      const isSupplier = cardType === 'supplier';
      const tableName = isSupplier
        ? `rex_${ERP_SETTINGS.firmNr}_suppliers`
        : `rex_${ERP_SETTINGS.firmNr}_customers`;

      const prefix = isSupplier ? 'TED-' : 'MUS-';

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

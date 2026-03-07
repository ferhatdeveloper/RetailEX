/**
 * Customer API - Direct PostgreSQL Implementation
 * Note: Uses rex_{firm}_customers table
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import type { Customer } from '../../core/types';

export const customerAPI = {
  /**
   * Get all customers
   */
  async getAll(): Promise<Customer[]> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_customers`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE firm_nr = $1 AND is_active = true ORDER BY name ASC`,
        [ERP_SETTINGS.firmNr]
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
      const searchTerm = `%${query.toLowerCase()}%`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} 
         WHERE firm_nr = $1 
         AND is_active = true 
         AND (
           LOWER(name) LIKE $2 OR 
           phone LIKE $2 OR 
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
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE phone = $1 AND firm_nr = $2 AND is_active = true`,
        [phone, ERP_SETTINGS.firmNr]
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
      const { rows } = await postgres.query(
        `INSERT INTO ${tableName} (code, name, phone, email, address, points, total_spent, is_active, firm_nr) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          customer.code || '',
          customer.name,
          customer.phone,
          customer.email || '',
          customer.address || '',
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
    email: dbCustomer.email,
    address: dbCustomer.address,
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



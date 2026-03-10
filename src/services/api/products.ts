/**
 * Product API - Direct PostgreSQL Implementation
 * Note: Uses rex_{firm}_products table
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import type { Product } from '../../core/types';

export const productAPI = {
  /**
   * Get all products
   */
  async getAll(): Promise<Product[]> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE firm_nr = $1 AND is_active = true ORDER BY name ASC`,
        [ERP_SETTINGS.firmNr]
      );
      return rows.map(mapDatabaseProductToProduct);
    } catch (error) {
      console.error('[ProductAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Get product by ID
   */
  async getById(id: string): Promise<Product | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] getById failed:', error);
      return null;
    }
  },

  /**
   * Get product by barcode
   */
  async getByBarcode(barcode: string): Promise<Product | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE barcode = $1 AND firm_nr = $2 AND is_active = true`,
        [barcode, ERP_SETTINGS.firmNr]
      );
      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] getByBarcode failed:', error);
      return null;
    }
  },

  /**
   * Create new product
   */
  async create(product: Omit<Product, 'id'>): Promise<Product | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;

      const productData = {
        name: product.name,
        code: product.code || '',
        barcode: product.barcode || '',
        // V2: 'category' kolonu kaldırıldı → category_code kullan
        category_code: (product as any).categoryCode || (product as any).category_code || product.category || '',
        price: product.price || 0,
        cost: product.cost || 0,
        stock: product.stock || 0,
        min_stock: product.minStock || product.min_stock || 0,
        max_stock: product.max_stock || 0,
        critical_stock: product.criticalStock || 0,
        unit: product.unit || 'Adet',
        is_active: true,
        firm_nr: ERP_SETTINGS.firmNr,
        image_url: product.image_url || '',
        description: product.description || '',
        description_tr: product.description_tr || '',
        description_en: product.description_en || '',
        description_ar: product.description_ar || '',
        description_ku: product.description_ku || '',
        group_code: (product as any).groupCode || (product as any).group_code || '',
        sub_group_code: (product as any).subGroupCode || (product as any).sub_group_code || '',
        brand: product.brand || '',
        model: product.model || '',
        manufacturer: product.manufacturer || '',
        supplier: product.supplier || '',
        origin: product.origin || '',
        material_type: (product as any).materialType || (product as any).material_type || 'commercial_goods',
        vat_rate: product.taxRate || 0,
        special_code_1: product.specialCode1 || '',
        special_code_2: product.specialCode2 || '',
        special_code_3: product.specialCode3 || '',
        special_code_4: product.specialCode4 || '',
        special_code_5: product.specialCode5 || '',
        special_code_6: product.specialCode6 || '',
        price_list_1: product.priceList1 || 0,
        price_list_2: product.priceList2 || 0,
        price_list_3: product.priceList3 || 0,
        price_list_4: product.priceList4 || 0,
        price_list_5: product.priceList5 || 0,
        price_list_6: product.priceList6 || 0,
      };

      const columns = Object.keys(productData);
      const values = Object.values(productData);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`;
      const { rows } = await postgres.query(query, values);

      const newId = rows[0]?.id;
      return newId ? { ...product, id: newId } as Product : null;
    } catch (error) {
      console.error('[ProductAPI] create failed:', error);
      throw error;
    }
  },

  /**
   * Update product
   */
  async update(id: string, updates: Partial<Product>): Promise<Product | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      // Mapping for camelCase to snake_case
      const fieldMapping: Record<string, string> = {
        minStock: 'min_stock',
        min_stock: 'min_stock',
        max_stock: 'max_stock',
        criticalStock: 'critical_stock',
        critical_stock: 'critical_stock',
        // V2: 'category' kolonu yok → category_code'a map et
        category: 'category_code',
        categoryCode: 'category_code',
        category_code: 'category_code',
        groupCode: 'group_code',
        group_code: 'group_code',
        subGroupCode: 'sub_group_code',
        sub_group_code: 'sub_group_code',
        specialCode1: 'special_code_1',
        specialCode2: 'special_code_2',
        specialCode3: 'special_code_3',
        specialCode4: 'special_code_4',
        specialCode5: 'special_code_5',
        specialCode6: 'special_code_6',
        priceList1: 'price_list_1',
        priceList2: 'price_list_2',
        priceList3: 'price_list_3',
        priceList4: 'price_list_4',
        priceList5: 'price_list_5',
        priceList6: 'price_list_6',
        taxRate: 'vat_rate',
        vatRate: 'vat_rate',
        materialType: 'material_type',
        material_type: 'material_type',
        isActive: 'is_active',
        hasVariants: 'has_variants',
        has_variants: 'has_variants'
      };

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          const dbKey = fieldMapping[key] || key;
          fields.push(`${dbKey} = $${i++}`);
          values.push(value);
        }
      });

      if (fields.length === 0) return this.getById(id);

      values.push(id);
      values.push(ERP_SETTINGS.firmNr);
      const query = `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${i} AND firm_nr = $${i + 1} RETURNING *`;
      const { rows } = await postgres.query(query, values);

      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] update failed:', error);
      throw error;
    }
  },

  /**
   * Delete product
   */
  async delete(id: string): Promise<boolean> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const { rowCount } = await postgres.query(
        `UPDATE ${tableName} SET is_active = false WHERE id = $1 AND firm_nr = $2`,
        [id, ERP_SETTINGS.firmNr]
      );
      return rowCount > 0;
    } catch (error) {
      console.error('[ProductAPI] delete failed:', error);
      return false;
    }
  },

  /**
   * Search products
   */
  async search(query: string): Promise<Product[]> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} 
         WHERE (name ILIKE $1 OR barcode ILIKE $1 OR code ILIKE $1) AND firm_nr = $2 AND is_active = true 
         ORDER BY name ASC LIMIT 50`,
        [`%${query}%`, ERP_SETTINGS.firmNr]
      );
      return rows.map(mapDatabaseProductToProduct);
    } catch (error) {
      console.error('[ProductAPI] search failed:', error);
      return [];
    }
  },
  /**
   * Update product stock
   */
  async updateStock(id: string, quantity: number): Promise<boolean> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const { rowCount } = await postgres.query(
        `UPDATE ${tableName} SET stock = $1::text::numeric WHERE id = $2 AND firm_nr = $3`,
        [quantity.toString(), id, ERP_SETTINGS.firmNr]
      );
      return rowCount > 0;
    } catch (error) {
      console.error('[ProductAPI] updateStock failed:', error);
      return false;
    }
  },
};

/**
 * Helper: Map database product
 */
function mapDatabaseProductToProduct(dbProduct: any): Product {
  return {
    id: dbProduct.id,
    name: dbProduct.name,
    code: dbProduct.code,
    barcode: dbProduct.barcode,
    category: dbProduct.category || dbProduct.category_code || '',
    price: parseFloat(dbProduct.price || 0),
    cost: parseFloat(dbProduct.cost || 0),
    stock: parseFloat(dbProduct.stock || 0),
    minStock: parseFloat(dbProduct.min_stock || 0),
    min_stock: parseFloat(dbProduct.min_stock || 0),
    max_stock: parseFloat(dbProduct.max_stock || 0),
    unit: dbProduct.unit,
    isActive: dbProduct.is_active,
    hasVariants: dbProduct.has_variants,
    description: dbProduct.description,
    description_tr: dbProduct.description_tr,
    description_en: dbProduct.description_en,
    description_ar: dbProduct.description_ar,
    description_ku: dbProduct.description_ku,
    image_url: dbProduct.image_url,
    taxRate: parseFloat(dbProduct.vat_rate || 0),
    categoryCode: dbProduct.category_code,
    groupCode: dbProduct.group_code,
    subGroupCode: dbProduct.sub_group_code,
    brand: dbProduct.brand,
    model: dbProduct.model,
    manufacturer: dbProduct.manufacturer,
    supplier: dbProduct.supplier,
    origin: dbProduct.origin,
    materialType: dbProduct.material_type as any,
    specialCode1: dbProduct.special_code_1,
    specialCode2: dbProduct.special_code_2,
    specialCode3: dbProduct.special_code_3,
    specialCode4: dbProduct.special_code_4,
    specialCode5: dbProduct.special_code_5,
    specialCode6: dbProduct.special_code_6,
    priceList1: parseFloat(dbProduct.price_list_1 || 0),
    priceList2: parseFloat(dbProduct.price_list_2 || 0),
    priceList3: parseFloat(dbProduct.price_list_3 || 0),
    priceList4: parseFloat(dbProduct.price_list_4 || 0),
    priceList5: parseFloat(dbProduct.price_list_5 || 0),
    priceList6: parseFloat(dbProduct.price_list_6 || 0),
  };
}

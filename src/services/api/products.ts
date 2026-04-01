/**
 * Product API - Direct PostgreSQL Implementation
 * Note: Uses rex_{firm}_products table
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import type { Product } from '../../core/types';
import { useAuthStore } from '../../store/useAuthStore';

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
   * Get product by code (for upsert / Excel import)
   */
  async getByCode(code: string): Promise<Product | null> {
    if (!code?.trim()) return null;
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE code = $1 AND firm_nr = $2 LIMIT 1`,
        [code.trim(), ERP_SETTINGS.firmNr]
      );
      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] getByCode failed:', error);
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
   * Deep lookup by any barcode (primary or unit-specific)
   */
  async lookupByBarcode(barcode: string): Promise<{ product: Product, unitInfo?: any } | null> {
    try {
      // 1. Try primary barcode first
      const product = await this.getByBarcode(barcode);
      if (product) return { product };

      // 2. Try unit-specific barcodes
      const { rows } = await postgres.query(
        `SELECT * FROM product_barcodes WHERE barcode_code = $1 ORDER BY is_primary DESC LIMIT 1`,
        [barcode]
      );

      if (rows[0]) {
        const foundProduct = await this.getById(rows[0].product_id);
        if (foundProduct) {
          const unitName = rows[0].unit;
          const unitsetId = (foundProduct as any).unitsetId || (foundProduct as any).unitset_id;
          let multiplier = 1;

          // Öncelik 1: unitset_id varsa unitsetl tablosundan çarpan bul
          if (unitName && unitsetId) {
            try {
              const { rows: unitRows } = await postgres.query(
                `SELECT conv_fact1, multiplier1 FROM unitsetl WHERE unitset_id = $1 AND (name = $2 OR code = $2) LIMIT 1`,
                [unitsetId, unitName]
              );
              if (unitRows[0]) {
                multiplier = parseFloat(unitRows[0].conv_fact1 || unitRows[0].multiplier1) || 1;
              }
            } catch (_) { /* ignore */ }
          }

          // Öncelik 2: unitset_id yoksa product_unit_conversions tablosundan çarpan bul
          // (Kullanıcı ürünü manuel birim çevrimi ile kurmuş, unitset atamamış)
          if (multiplier === 1 && unitName) {
            try {
              const { rows: convRows } = await postgres.query(
                `SELECT factor FROM product_unit_conversions WHERE product_id = $1 AND from_unit = $2 LIMIT 1`,
                [foundProduct.id, unitName]
              );
              if (convRows[0]) {
                multiplier = parseFloat(convRows[0].factor) || 1;
              }
            } catch (_) { /* ignore */ }
          }

          return {
            product: foundProduct,
            unitInfo: { ...rows[0], multiplier }
          };
        }
      }

      return null;
    } catch (error) {
      console.error('[ProductAPI] lookupByBarcode failed:', error);
      return null;
    }
  },

  /**
   * Internal: Generate next barcode from template
   */
  async generateNextBarcode(): Promise<string> {
    try {
      const { rows } = await postgres.query(
        'SELECT * FROM public.barcode_templates WHERE is_active = true ORDER BY created_at ASC LIMIT 1'
      );

      if (!rows[0]) return '';

      const template = rows[0];
      const nextValue = BigInt(template.current_value) + 1n;
      const barcodeValue = `${template.prefix}${nextValue.toString().padStart(template.length - template.prefix.length, '0')}`;

      await postgres.query(
        'UPDATE public.barcode_templates SET current_value = $1, updated_at = NOW() WHERE id = $2',
        [nextValue.toString(), template.id]
      );

      return barcodeValue;
    } catch (error) {
      console.error('[ProductAPI] generateNextBarcode failed:', error);
      return '';
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
        barcode: product.barcode || await this.generateNextBarcode(),
        // V2: 'category' kolonu kaldırıldı → category_code kullan
        category_code: (product as any).categoryCode || (product as any).category_code || product.category || '',
        price: product.price || 0,
        cost: product.cost || 0,
        stock: product.stock || 0,
        min_stock: product.minStock || product.min_stock || 0,
        max_stock: product.max_stock || 0,
        critical_stock: product.criticalStock || 0,
        unit: product.unit || 'Adet',
        unitset_id: (product as any).unitsetId || (product as any).unitset_id || null,
        is_active: true,
        firm_nr: ERP_SETTINGS.firmNr,
        image_url: product.image_url || '',
        image_url_cdn: (product as any).image_url_cdn || '',
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
        special_code_3: (product as any).specialCode3 || '',
        special_code_4: (product as any).specialCode4 || '',
        special_code_5: (product as any).specialCode5 || '',
        special_code_6: (product as any).specialCode6 || '',
        unit2: (product as any).unit2 || '',
        unit3: (product as any).unit3 || '',
        has_variants: (product as any).hasVariants || (product as any).has_variants || false,
        // Yeni ürün INSERT'inde eksikti; USD/EUR ve kur alanları kayda hiç yazılmıyordu
        currency: (product as any).currency || 'IQD',
        purchase_price_usd: parseFloat(String((product as any).purchasePriceUSD ?? (product as any).purchase_price_usd ?? 0)) || 0,
        sale_price_usd: parseFloat(String((product as any).salePriceUSD ?? (product as any).sale_price_usd ?? 0)) || 0,
        purchase_price_eur: parseFloat(String((product as any).purchasePriceEUR ?? (product as any).purchase_price_eur ?? 0)) || 0,
        sale_price_eur: parseFloat(String((product as any).salePriceEUR ?? (product as any).sale_price_eur ?? 0)) || 0,
        custom_exchange_rate: parseFloat(String((product as any).customExchangeRate ?? (product as any).custom_exchange_rate ?? 0)) || 0,
        auto_calculate_usd: Boolean((product as any).autoCalculateUSD ?? (product as any).auto_calculate_usd ?? false),
      };

      const columns = Object.keys(productData);
      const values = Object.values(productData);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
      const { rows } = await postgres.query(query, values);

      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error: any) {
      console.error('[ProductAPI] create failed:', error);
      const errCode = error?.code;
      const detail = String(error?.detail ?? error?.message ?? '');
      if (errCode === '23505' || /23505|unique|tekil|duplicate/i.test(detail || '')) {
        const match = detail.match(/\(code\)=\(([^)]+)\)/) || detail.match(/key is "([^"]+)"/);
        const codeValue = match ? match[1] : 'bu kod';
        throw new Error(`Bu ürün kodu zaten mevcut: ${codeValue}. Excel aktarımında aynı kod varsa kayıt güncellenir.`);
      }
      throw new Error(error?.message || 'Ürün kaydedilemedi.');
    }
  },

  /**
   * Add a new product
   */
  async addProduct(product: Product): Promise<Product | null> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const productData = { ...product, firm_nr: ERP_SETTINGS.firmNr };

      // Ensure id is not an empty string (let database generate it if new)
      if (!productData.id || productData.id === '') {
        delete (productData as any).id;
      }

      // Mapping for camelCase to snake_case (Shared with update)
      const fieldMapping: Record<string, string> = {
        minStock: 'min_stock',
        maxStock: 'max_stock',
        criticalStock: 'critical_stock',
        category: 'category_code',
        categoryCode: 'category_code',
        groupCode: 'group_code',
        groupcode: 'group_code',
        subGroupCode: 'sub_group_code',
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
        isActive: 'is_active',
        hasVariants: 'has_variants',
        customExchangeRate: 'custom_exchange_rate',
        autoCalculateUSD: 'auto_calculate_usd',
        salePriceUSD: 'sale_price_usd',
        purchasePriceUSD: 'purchase_price_usd',
        salePriceEUR: 'sale_price_eur',
        purchasePriceEUR: 'purchase_price_eur',
        unitsetId: 'unitset_id',
        image_url_cdn: 'image_url_cdn',
      };

      const finalData: Record<string, any> = {};
      
      // Auto-barcode if empty
      if (!productData.barcode || productData.barcode === '') {
        productData.barcode = await this.generateNextBarcode();
      }

      Object.entries(productData).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbKey = fieldMapping[key] || key;
          finalData[dbKey] = value;
        }
      });

      const columns = Object.keys(finalData);
      const values = Object.values(finalData);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`;
      const { rows } = await postgres.query(query, values);

      const newId = rows[0]?.id;
      return newId ? { ...product, id: newId } as Product : null;
    } catch (error) {
      console.error('[ProductAPI] addProduct failed:', error);
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
        maxStock: 'max_stock',
        criticalStock: 'critical_stock',
        category: 'category_code',
        categoryCode: 'category_code',
        groupCode: 'group_code',
        subGroupCode: 'sub_group_code',
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
        isActive: 'is_active',
        hasVariants: 'has_variants',
        unitsetId: 'unitset_id',
        image_url_cdn: 'image_url_cdn',
        customExchangeRate: 'custom_exchange_rate',
        autoCalculateUSD: 'auto_calculate_usd',
        salePriceUSD: 'sale_price_usd',
        purchasePriceUSD: 'purchase_price_usd',
        salePriceEUR: 'sale_price_eur',
        purchasePriceEUR: 'purchase_price_eur',
      };

      const fieldValues = new Map<string, any>();

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          const dbKey = fieldMapping[key] || key;
          fieldValues.set(dbKey, value);
        }
      });

      if (fieldValues.size === 0) return productAPI.getById(id);

      // Handle Logging for Custom Exchange Rate BEFORE update
      if (fieldValues.has('custom_exchange_rate')) {
        try {
          const oldProduct = await productAPI.getById(id);
          const oldRate = oldProduct?.customExchangeRate || 0;
          const newRate = fieldValues.get('custom_exchange_rate');
          
          if (oldRate !== newRate) {
            const currentUser = useAuthStore.getState().user;
            
            await postgres.query(
              `INSERT INTO product_exchange_rate_history (product_id, old_rate, new_rate, changed_by) 
               VALUES ($1, $2, $3, $4)`,
              [id, oldRate, newRate, currentUser?.fullName || 'Sistem']
            );
          }
        } catch (logErr) {
          console.error('[ProductAPI] Logging rate change failed:', logErr);
        }
      }

      fieldValues.forEach((value, dbKey) => {
        fields.push(`${dbKey} = $${i++}`);
        values.push(value);
      });

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

  /**
   * Bulk update products
   */
  async bulkUpdate(ids: string[], updates: Partial<Product>): Promise<number> {
    try {
      const tableName = `rex_${ERP_SETTINGS.firmNr}_products`;
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      const fieldMapping: Record<string, string> = {
        price: 'price',
        cost: 'cost',
        isActive: 'is_active',
        taxRate: 'vat_rate',
        salePriceUSD: 'sale_price_usd',
        purchasePriceUSD: 'purchase_price_usd',
      };

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          const dbKey = fieldMapping[key] || key;
          fields.push(`${dbKey} = $${i++}`);
          values.push(value);
        }
      });

      if (fields.length === 0) return 0;

      values.push(ids);
      const query = `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = ANY($${i}) AND firm_nr = ${ERP_SETTINGS.firmNr}`;
      const { rowCount } = await postgres.query(query, values);

      return rowCount || 0;
    } catch (error) {
      console.error('[ProductAPI] bulkUpdate failed:', error);
      throw error;
    }
  },
  /**
   * Get product exchange rate history
   */
  async getExchangeRateHistory(productId: string): Promise<any[]> {
    try {
      const { rows } = await postgres.query(
        `SELECT * FROM product_exchange_rate_history 
         WHERE product_id = $1 
         ORDER BY change_date DESC`,
        [productId]
      );
      return rows;
    } catch (error) {
      console.error('[ProductAPI] getExchangeRateHistory failed:', error);
      return [];
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
    image_url_cdn: dbProduct.image_url_cdn,
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
    currency: dbProduct.currency || 'IQD',
    salePriceUSD: parseFloat(dbProduct.sale_price_usd || 0),
    purchasePriceUSD: parseFloat(dbProduct.purchase_price_usd || 0),
    salePriceEUR: parseFloat(dbProduct.sale_price_eur || 0),
    purchasePriceEUR: parseFloat(dbProduct.purchase_price_eur || 0),
    customExchangeRate: parseFloat(dbProduct.custom_exchange_rate || 0),
    autoCalculateUSD: dbProduct.auto_calculate_usd === true,
    unitsetId: dbProduct.unitset_id || dbProduct.unit_set_id,
  };
}

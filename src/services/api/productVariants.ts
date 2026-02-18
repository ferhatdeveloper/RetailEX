/**
 * Product Variants API - Direct PostgreSQL Implementation
 */

import { postgres } from '../postgres';
import type { ProductVariant } from '../../core/types';

export const productVariantAPI = {
  /**
   * Get all variants for a product
   */
  async getByProductId(productId: string): Promise<ProductVariant[]> {
    try {
      const { rows } = await postgres.query(
        `SELECT * FROM product_variants WHERE product_id = $1 AND is_active = true ORDER BY variant_name ASC`,
        [productId]
      );
      return rows.map(mapDatabaseVariantToVariant);
    } catch (error) {
      console.error('[ProductVariantAPI] getByProductId failed:', error);
      return [];
    }
  },

  /**
   * Get variant by ID
   */
  async getById(id: string): Promise<ProductVariant | null> {
    try {
      const { rows } = await postgres.query(
        `SELECT * FROM product_variants WHERE id = $1`,
        [id]
      );
      return rows[0] ? mapDatabaseVariantToVariant(rows[0]) : null;
    } catch (error) {
      console.error('[ProductVariantAPI] getById failed:', error);
      return null;
    }
  },

  /**
   * Get variant by barcode
   */
  async getByBarcode(barcode: string): Promise<ProductVariant | null> {
    try {
      const { rows } = await postgres.query(
        `SELECT * FROM product_variants WHERE barcode = $1 AND is_active = true`,
        [barcode]
      );
      return rows[0] ? mapDatabaseVariantToVariant(rows[0]) : null;
    } catch (error) {
      console.error('[ProductVariantAPI] getByBarcode failed:', error);
      return null;
    }
  },

  /**
   * Create new variant
   */
  async create(productId: string, variant: Omit<ProductVariant, 'id'>): Promise<ProductVariant | null> {
    try {
      const { rows } = await postgres.query(
        `INSERT INTO product_variants (
            product_id, variant_name, sku, barcode, attributes, price, cost, stock, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING *`,
        [
          productId,
          `${variant.color || ''} ${variant.size || ''}`.trim(),
          variant.code,
          variant.barcode,
          JSON.stringify({ color: variant.color, size: variant.size }),
          variant.price || 0,
          variant.cost || 0,
          variant.stock || 0
        ]
      );
      return mapDatabaseVariantToVariant(rows[0]);
    } catch (error: any) {
      console.error('[ProductVariantAPI] create failed:', error);
      if (error.code === '23505') {
        throw new Error('Bu varyant barkodu zaten kullanılıyor');
      }
      throw new Error('Varyant eklenemedi');
    }
  },

  /**
   * Create multiple variants at once
   */
  async createBulk(productId: string, variants: Omit<ProductVariant, 'id'>[]): Promise<ProductVariant[]> {
    try {
      const results: ProductVariant[] = [];
      for (const variant of variants) {
        const created = await this.create(productId, variant);
        if (created) results.push(created);
      }
      return results;
    } catch (error: any) {
      console.error('[ProductVariantAPI] createBulk failed:', error);
      throw error;
    }
  },

  /**
   * Update variant
   */
  async update(id: string, updates: Partial<ProductVariant>): Promise<ProductVariant | null> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      if (updates.code !== undefined) { fields.push(`sku = $${i++}`); values.push(updates.code); }
      if (updates.barcode !== undefined) { fields.push(`barcode = $${i++}`); values.push(updates.barcode); }
      if (updates.price !== undefined) { fields.push(`price = $${i++}`); values.push(updates.price); }
      if (updates.stock !== undefined) { fields.push(`stock = $${i++}`); values.push(updates.stock); }
      if (updates.color !== undefined || updates.size !== undefined) {
        const current = await this.getById(id);
        const color = updates.color !== undefined ? updates.color : current?.color;
        const size = updates.size !== undefined ? updates.size : current?.size;
        fields.push(`variant_name = $${i++}`);
        values.push(`${color || ''} ${size || ''}`.trim());
        fields.push(`attributes = $${i++}`);
        values.push(JSON.stringify({ color, size }));
      }

      if (fields.length === 0) return this.getById(id);

      values.push(id);
      const { rows } = await postgres.query(
        `UPDATE product_variants SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      );
      return mapDatabaseVariantToVariant(rows[0]);
    } catch (error: any) {
      console.error('[ProductVariantAPI] update failed:', error);
      if (error.code === '23505') {
        throw new Error('Bu varyant barkodu zaten kullanılıyor');
      }
      throw new Error('Varyant güncellenemedi');
    }
  },

  /**
   * Delete variant (soft delete)
   */
  async delete(id: string): Promise<boolean> {
    try {
      await postgres.query(`UPDATE product_variants SET is_active = false WHERE id = $1`, [id]);
      return true;
    } catch (error) {
      console.error('[ProductVariantAPI] delete failed:', error);
      return false;
    }
  },

  /**
   * Delete all variants for a product
   */
  async deleteByProductId(productId: string): Promise<boolean> {
    try {
      await postgres.query(`DELETE FROM product_variants WHERE product_id = $1`, [productId]);
      return true;
    } catch (error) {
      console.error('[ProductVariantAPI] deleteByProductId failed:', error);
      return false;
    }
  },

  /**
   * Update stock for variant
   */
  async updateStock(id: string, quantity: number): Promise<boolean> {
    try {
      await postgres.query(`UPDATE product_variants SET stock = $1 WHERE id = $2`, [quantity, id]);
      return true;
    } catch (error) {
      console.error('[ProductVariantAPI] updateStock failed:', error);
      return false;
    }
  },

  /**
   * Sync variants
   */
  async syncVariants(productId: string, variants: Omit<ProductVariant, 'id'>[]): Promise<ProductVariant[]> {
    await this.deleteByProductId(productId);
    return await this.createBulk(productId, variants);
  },
};

function mapDatabaseVariantToVariant(dbVariant: any): ProductVariant {
  const attributes = dbVariant.attributes || {};
  return {
    id: dbVariant.id,
    code: dbVariant.sku,
    barcode: dbVariant.barcode,
    size: attributes.size || '',
    color: attributes.color || '',
    stock: parseFloat(dbVariant.stock || 0),
    price: parseFloat(dbVariant.price || 0),
    cost: parseFloat(dbVariant.cost || 0),
  };
}

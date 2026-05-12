/**
 * Product Variants API - Direct PostgreSQL Implementation
 * V2 Schema: product_variants has (id, product_id, sku, attributes JSONB)
 * Extra data (barcode, price, cost, stock, is_active) is stored in attributes JSONB
 */

import { shouldUseTenantPostgrestApi } from '../../config/postgrest.config';
import { postgres, ERP_SETTINGS } from '../postgres';
import type { ProductVariant } from '../../core/types';

function padFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function variantsPath(suffix = ''): string {
  return `/rex_${padFirmNr()}_product_variants${suffix}`;
}

export const productVariantAPI = {
  /**
   * Get all variants for a product
   */
  async getByProductId(productId: string): Promise<ProductVariant[]> {
    try {
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          variantsPath(),
          { select: '*', product_id: `eq.${productId}`, order: 'sku.asc' },
          { schema: 'public' }
        );
        return (Array.isArray(rows) ? rows : [])
          .map(mapDatabaseVariantToVariant)
          .filter(v => v.is_active !== false);
      }
      const { rows } = await postgres.query(
        `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY sku ASC`,
        [productId]
      );
      return rows
        .map(mapDatabaseVariantToVariant)
        .filter(v => v.is_active !== false);
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
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          variantsPath(),
          { select: '*', id: `eq.${id}`, limit: 1 },
          { schema: 'public' }
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        return row ? mapDatabaseVariantToVariant(row) : null;
      }
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
   * Get variant by barcode (stored in attributes JSONB)
   */
  async getByBarcode(barcode: string): Promise<ProductVariant | null> {
    try {
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          variantsPath(),
          {
            select: '*',
            'attributes->>barcode': `eq.${barcode}`,
            limit: 5,
          },
          { schema: 'public' }
        );
        const list = Array.isArray(rows) ? rows : [];
        const hit = list.find(r => {
          const a = r.attributes || {};
          return a.is_active !== false;
        });
        return hit ? mapDatabaseVariantToVariant(hit) : null;
      }
      const { rows } = await postgres.query(
        `SELECT * FROM product_variants WHERE attributes->>'barcode' = $1 AND (attributes->>'is_active')::boolean IS NOT FALSE`,
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
      const variantName = `${variant.color || ''} ${variant.size || ''}`.trim();
      const attributes = {
        variant_name: variantName,
        color: variant.color || '',
        size: variant.size || '',
        barcode: variant.barcode || '',
        price: variant.price || 0,
        cost: variant.cost || 0,
        stock: variant.stock || 0,
        is_active: true,
      };

      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.post<any[]>(
          variantsPath(),
          {
            product_id: productId,
            sku: variant.code || variantName,
            attributes,
          },
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return mapDatabaseVariantToVariant(row);
      }

      const { rows } = await postgres.query(
        `INSERT INTO product_variants (product_id, sku, attributes)
         VALUES ($1, $2, $3::jsonb) RETURNING *`,
        [productId, variant.code || variantName, JSON.stringify(attributes)]
      );
      return mapDatabaseVariantToVariant(rows[0]);
    } catch (error: any) {
      console.error('[ProductVariantAPI] create failed:', error);
      if (error.code === '23505' || String(error?.message || error).includes('409')) {
        throw new Error('Bu varyant SKU zaten kullanılıyor');
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
      const current = await this.getById(id);
      if (!current) throw new Error('Varyant bulunamadı');

      const color = updates.color !== undefined ? updates.color : current.color;
      const size = updates.size !== undefined ? updates.size : current.size;
      const variantName = `${color || ''} ${size || ''}`.trim();

      const attributes = {
        variant_name: variantName,
        color: color || '',
        size: size || '',
        barcode: updates.barcode !== undefined ? updates.barcode : current.barcode,
        price: updates.price !== undefined ? updates.price : current.price,
        cost: updates.cost !== undefined ? updates.cost : current.cost,
        stock: updates.stock !== undefined ? updates.stock : current.stock,
        is_active: true,
      };

      const fields: string[] = ['attributes = $1::jsonb'];
      const values: any[] = [JSON.stringify(attributes)];
      let i = 2;

      if (updates.code !== undefined) {
        fields.push(`sku = $${i++}`);
        values.push(updates.code);
      }

      values.push(id);
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const body: Record<string, unknown> = { attributes };
        if (updates.code !== undefined) body.sku = updates.code;
        const rows = await postgrest.patch<any[]>(
          `${variantsPath()}?id=eq.${encodeURIComponent(id)}`,
          body,
          { schema: 'public', prefer: 'return=representation' }
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return mapDatabaseVariantToVariant(row);
      }
      const { rows } = await postgres.query(
        `UPDATE product_variants SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      );
      return mapDatabaseVariantToVariant(rows[0]);
    } catch (error: any) {
      console.error('[ProductVariantAPI] update failed:', error);
      throw new Error('Varyant güncellenemedi');
    }
  },

  /**
   * Delete variant (soft delete via attributes)
   */
  async delete(id: string): Promise<boolean> {
    try {
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const dbRow = await postgrest.get<any[]>(
          variantsPath(),
          { select: 'attributes', id: `eq.${id}`, limit: 1 },
          { schema: 'public' }
        );
        const attrs = (Array.isArray(dbRow) && dbRow[0]?.attributes) || {};
        await postgrest.patch(
          `${variantsPath()}?id=eq.${encodeURIComponent(id)}`,
          { attributes: { ...attrs, is_active: false } },
          { schema: 'public', prefer: 'return=minimal' }
        );
        return true;
      }
      await postgres.query(
        `UPDATE product_variants SET attributes = attributes || '{"is_active": false}'::jsonb WHERE id = $1`,
        [id]
      );
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
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        await postgrest.delete(
          `${variantsPath()}?product_id=eq.${encodeURIComponent(productId)}`,
          { schema: 'public', prefer: 'return=minimal' }
        );
        return true;
      }
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
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const dbRow = await postgrest.get<any[]>(
          variantsPath(),
          { select: 'attributes', id: `eq.${id}`, limit: 1 },
          { schema: 'public' }
        );
        const attrs = (Array.isArray(dbRow) && dbRow[0]?.attributes) || {};
        await postgrest.patch(
          `${variantsPath()}?id=eq.${encodeURIComponent(id)}`,
          { attributes: { ...attrs, stock: quantity } },
          { schema: 'public', prefer: 'return=minimal' }
        );
        return true;
      }
      await postgres.query(
        `UPDATE product_variants SET attributes = attributes || jsonb_build_object('stock', $1::numeric) WHERE id = $2`,
        [quantity, id]
      );
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

function mapDatabaseVariantToVariant(dbVariant: any): ProductVariant & { is_active?: boolean } {
  const attributes = dbVariant.attributes || {};
  return {
    id: dbVariant.id,
    productId: dbVariant.product_id,
    code: dbVariant.sku || '',
    barcode: attributes.barcode || '',
    size: attributes.size || '',
    color: attributes.color || '',
    stock: parseFloat(attributes.stock || 0),
    price: parseFloat(attributes.price || 0),
    cost: parseFloat(attributes.cost || 0),
    is_active: attributes.is_active !== false,
  };
}

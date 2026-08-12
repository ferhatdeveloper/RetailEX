import { shouldUsePostgrestForCrud } from '../../config/postgrest.config';
import { postgres, ERP_SETTINGS } from '../postgres';

function rexFirmPadded(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0');
}

const PG_SCHEMA = { schema: 'public' as const };

export interface ProductBarcode {
  id: string;
  product_id: string;
  barcode_code: string;
  unit: string;
  sale_price: number;
  is_primary: boolean;
}

export interface ProductUnitConversion {
  id: string;
  product_id: string;
  from_unit: string;
  to_unit: string;
  factor: number;
}

export const productUnitsAPI = {
  // ── Barcodes ──────────────────────────────────────────────────────────────

  async getBarcodesByProductId(productId: string): Promise<ProductBarcode[]> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const path = `/rex_${rexFirmPadded()}_product_barcodes`;
        const rows = await postgrest.get<ProductBarcode[]>(
          path,
          {
            select: '*',
            product_id: `eq.${productId}`,
            order: 'is_primary.desc,created_at.asc',
          },
          PG_SCHEMA
        );
        return Array.isArray(rows) ? rows : [];
      }
      const { rows } = await postgres.query(
        `SELECT * FROM product_barcodes WHERE product_id = $1 ORDER BY is_primary DESC, created_at ASC`,
        [productId]
      );
      return rows;
    } catch (error) {
      console.error('[productUnitsAPI] getBarcodesByProductId failed:', error);
      return [];
    }
  },

  async syncBarcodes(
    productId: string,
    barcodes: Array<{ barcode_code: string; unit: string; sale_price: number; is_primary: boolean }>
  ): Promise<void> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const path = `/rex_${rexFirmPadded()}_product_barcodes`;
        await postgrest.delete(
          `${path}?product_id=eq.${encodeURIComponent(productId)}`,
          PG_SCHEMA
        );
        const toInsert = barcodes.filter((b) => b.barcode_code || b.is_primary);
        if (toInsert.length === 0) return;
        const bulk = toInsert.map((b) => ({
          product_id: productId,
          barcode_code: b.barcode_code || '',
          unit: b.unit || '',
          sale_price: b.sale_price || 0,
          is_primary: Boolean(b.is_primary),
        }));
        await postgrest.post(path, bulk, { ...PG_SCHEMA, prefer: 'return=minimal' });
        return;
      }
      await postgres.query(`DELETE FROM product_barcodes WHERE product_id = $1`, [productId]);
      for (const b of barcodes) {
        if (!b.barcode_code && !b.is_primary) continue; // skip empty non-primary barcodes
        await postgres.query(
          `INSERT INTO product_barcodes (product_id, barcode_code, unit, sale_price, is_primary) VALUES ($1, $2, $3, $4, $5)`,
          [productId, b.barcode_code, b.unit, b.sale_price || 0, b.is_primary]
        );
      }
    } catch (error) {
      console.error('[productUnitsAPI] syncBarcodes failed:', error);
      throw error;
    }
  },

  // ── Unit Conversions ───────────────────────────────────────────────────────

  async getUnitConversionsByProductId(productId: string): Promise<ProductUnitConversion[]> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const path = `/rex_${rexFirmPadded()}_product_unit_conversions`;
        const rows = await postgrest.get<ProductUnitConversion[]>(
          path,
          {
            select: '*',
            product_id: `eq.${productId}`,
            order: 'created_at.asc',
          },
          PG_SCHEMA
        );
        return Array.isArray(rows) ? rows : [];
      }
      const { rows } = await postgres.query(
        `SELECT * FROM product_unit_conversions WHERE product_id = $1 ORDER BY created_at ASC`,
        [productId]
      );
      return rows;
    } catch (error) {
      console.error('[productUnitsAPI] getUnitConversionsByProductId failed:', error);
      return [];
    }
  },

  async syncUnitConversions(
    productId: string,
    conversions: Array<{ from_unit: string; to_unit: string; factor: number }>
  ): Promise<void> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const path = `/rex_${rexFirmPadded()}_product_unit_conversions`;
        await postgrest.delete(
          `${path}?product_id=eq.${encodeURIComponent(productId)}`,
          PG_SCHEMA
        );
        const toInsert = conversions.filter((c) => c.from_unit && c.to_unit);
        if (toInsert.length === 0) return;
        const bulk = toInsert.map((c) => ({
          product_id: productId,
          from_unit: c.from_unit,
          to_unit: c.to_unit,
          factor: c.factor,
        }));
        await postgrest.post(path, bulk, { ...PG_SCHEMA, prefer: 'return=minimal' });
        return;
      }
      await postgres.query(`DELETE FROM product_unit_conversions WHERE product_id = $1`, [productId]);
      for (const c of conversions) {
        if (!c.from_unit || !c.to_unit) continue;
        await postgres.query(
          `INSERT INTO product_unit_conversions (product_id, from_unit, to_unit, factor) VALUES ($1, $2, $3, $4)`,
          [productId, c.from_unit, c.to_unit, c.factor]
        );
      }
    } catch (error) {
      console.error('[productUnitsAPI] syncUnitConversions failed:', error);
      throw error;
    }
  },
};

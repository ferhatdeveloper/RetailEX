import { describe, expect, it } from 'vitest';
import {
  isProductSalesMaterialLineType,
  PRODUCT_SALES_EXCLUDED_LINE_TYPES,
  SQL_PRODUCT_SALES_MATERIAL_ONLY,
} from '../../utils/productSalesReportFilters';

describe('Ürün Bazlı Satış raporu — malzeme/hizmet filtre', () => {
  it('Malzeme satırları dahil edilir (default + açıkça)', () => {
    expect(isProductSalesMaterialLineType('Malzeme')).toBe(true);
    expect(isProductSalesMaterialLineType('MALZEME')).toBe(true);
    expect(isProductSalesMaterialLineType('malzeme')).toBe(true);
    expect(isProductSalesMaterialLineType('material')).toBe(true);
    expect(isProductSalesMaterialLineType('Product')).toBe(true);
  });

  it('NULL / boş string → malzeme kabul edilir (DB default)', () => {
    expect(isProductSalesMaterialLineType(undefined)).toBe(true);
    expect(isProductSalesMaterialLineType(null)).toBe(true);
    expect(isProductSalesMaterialLineType('')).toBe(true);
    expect(isProductSalesMaterialLineType('   ')).toBe(true);
  });

  it('Hizmet / Service satırları Hariç (HAIR CUT gibi)', () => {
    expect(isProductSalesMaterialLineType('Hizmet')).toBe(false);
    expect(isProductSalesMaterialLineType('hizmet')).toBe(false);
    expect(isProductSalesMaterialLineType('HİZMET')).toBe(false);
    expect(isProductSalesMaterialLineType('Service')).toBe(false);
    expect(isProductSalesMaterialLineType('service')).toBe(false);
  });

  it('Paket / Package satırları Hariç', () => {
    expect(isProductSalesMaterialLineType('Paket')).toBe(false);
    expect(isProductSalesMaterialLineType('paket')).toBe(false);
    expect(isProductSalesMaterialLineType('Package')).toBe(false);
  });

  it('Promosyon / İndirim satırları Hariç', () => {
    expect(isProductSalesMaterialLineType('Promosyon')).toBe(false);
    expect(isProductSalesMaterialLineType('promosyon')).toBe(false);
    expect(isProductSalesMaterialLineType('İndirim')).toBe(false);
    expect(isProductSalesMaterialLineType('indirim')).toBe(false);
  });

  it('Hariç tutulan türler listesi beklenen seti içerir', () => {
    expect(PRODUCT_SALES_EXCLUDED_LINE_TYPES).toEqual([
      'hizmet',
      'service',
      'paket',
      'package',
      'promosyon',
      'indirim',
    ]);
  });

  it('SQL parçası gerekli NOT IN değerlerini içerir (case-insensitive)', () => {
    expect(SQL_PRODUCT_SALES_MATERIAL_ONLY).toContain("COALESCE(LOWER(TRIM(si.item_type)), 'malzeme')");
    expect(SQL_PRODUCT_SALES_MATERIAL_ONLY).toContain("NOT IN (");
    expect(SQL_PRODUCT_SALES_MATERIAL_ONLY).toContain("'hizmet'");
    expect(SQL_PRODUCT_SALES_MATERIAL_ONLY).toContain("'service'");
    expect(SQL_PRODUCT_SALES_MATERIAL_ONLY).toContain("'paket'");
    expect(SQL_PRODUCT_SALES_MATERIAL_ONLY).toContain("'package'");
    expect(SQL_PRODUCT_SALES_MATERIAL_ONLY).toContain("'promosyon'");
    expect(SQL_PRODUCT_SALES_MATERIAL_ONLY).toContain("'indirim'");
  });
});
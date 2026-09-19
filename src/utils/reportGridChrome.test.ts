import { describe, expect, it } from 'vitest';
import {
  coerceReportNumber,
  excelCellDisplay,
  isReportCodeColumnId,
  isReportSumColumnId,
  reportDisplayCode,
} from './reportGridChrome';

describe('reportGridChrome', () => {
  it('ürün kodu kolonlarını tanır', () => {
    expect(isReportCodeColumnId('product_code')).toBe(true);
    expect(isReportCodeColumnId('productCode')).toBe(true);
    expect(isReportCodeColumnId('itemCode')).toBe(true);
    expect(isReportCodeColumnId('code')).toBe(true);
    expect(isReportCodeColumnId('product_name')).toBe(false);
  });

  it('miktar/tutar kolonlarını toplar, birim fiyat ve yüzdeyi toplamaz', () => {
    expect(isReportSumColumnId('revenue')).toBe(true);
    expect(isReportSumColumnId('cogs')).toBe(true);
    expect(isReportSumColumnId('total_cost')).toBe(true);
    expect(isReportSumColumnId('inQty')).toBe(true);
    expect(isReportSumColumnId('outAmount')).toBe(true);
    expect(isReportSumColumnId('quantity_sold')).toBe(true);
    expect(isReportSumColumnId('stock')).toBe(true);
    expect(isReportSumColumnId('price')).toBe(false);
    expect(isReportSumColumnId('average_unit_cost')).toBe(false);
    expect(isReportSumColumnId('margin_percent')).toBe(false);
    expect(isReportSumColumnId('product_code')).toBe(false);
    expect(isReportSumColumnId('salesCount')).toBe(true);
    expect(isReportSumColumnId('avgSale')).toBe(false);
    expect(isReportSumColumnId('discount')).toBe(false);
    expect(isReportSumColumnId('totalSales')).toBe(true);
    expect(isReportSumColumnId('totalPurchased')).toBe(true);
    expect(isReportSumColumnId('minStock')).toBe(false);
    expect(isReportSumColumnId('maxStock')).toBe(false);
  });

  it('UUID ürün kodunu Excel hücresinde gizler', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(reportDisplayCode(uuid)).toBe('');
    expect(excelCellDisplay('product_code', uuid)).toBe('');
    expect(excelCellDisplay('product_code', '41')).toBe('41');
    expect(excelCellDisplay('revenue', 12.5)).toBe(12.5);
  });

  it('sayısal dip toplamı parse eder', () => {
    expect(coerceReportNumber('1.250,5')).toBe(1250.5);
    expect(coerceReportNumber(10)).toBe(10);
    expect(coerceReportNumber(null)).toBe(0);
  });
});

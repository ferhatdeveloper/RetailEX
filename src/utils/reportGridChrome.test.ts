import { describe, expect, it } from 'vitest';
import {
  coerceReportNumber,
  excelCellDisplay,
  formatReportFooterSum,
  isReportCodeColumnId,
  isReportMoneyColumnId,
  isReportMoneySumColumnId,
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

  it('footer para birimi yalnızca tutar kolonlarında', () => {
    expect(isReportMoneyColumnId('outAmount')).toBe(true);
    expect(isReportMoneyColumnId('inAmt')).toBe(true);
    expect(isReportMoneyColumnId('revenue')).toBe(true);
    expect(isReportMoneyColumnId('total_cost')).toBe(true);
    expect(isReportMoneyColumnId('totalRevenue')).toBe(true);
    expect(isReportMoneyColumnId('beforeDiscount')).toBe(true);
    expect(isReportMoneyColumnId('discount')).toBe(true);
    expect(isReportMoneyColumnId('incoming')).toBe(true);
    expect(isReportMoneyColumnId('stockValue')).toBe(true);
    expect(isReportMoneyColumnId('inQty')).toBe(false);
    expect(isReportMoneyColumnId('quantity_sold')).toBe(false);
    expect(isReportMoneyColumnId('stock')).toBe(false);
    expect(isReportMoneyColumnId('salesCount')).toBe(false);
    expect(isReportMoneyColumnId('price')).toBe(false);
    expect(isReportMoneySumColumnId('outAmount')).toBe(true);
    expect(isReportMoneySumColumnId('inQty')).toBe(false);
    expect(formatReportFooterSum(600000, 'inAmount', 'IQD')).toMatch(/IQD/);
    expect(formatReportFooterSum(70, 'inQty', 'IQD')).not.toMatch(/IQD/);
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

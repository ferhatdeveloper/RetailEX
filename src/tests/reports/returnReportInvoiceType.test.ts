/**
 * İade Raporu — menü/başlık ve fatura türü kolonu.
 * Tür trcode ve belge türünden gelir. Tutar değişmez.
 * Peşinat iade satırı olmaz. İndirim açık cariye yazılmaz.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleTranslations } from '../../locales/module-translations';
import { formatNumber } from '../../utils/formatNumber';
import {
  mapReturnReportRow,
  mapReturnReportRows,
  returnReportInvoiceTypeText,
} from '../../utils/returnReportRows';

const TYPE_LABELS = {
  purchaseReturn: moduleTranslations.purchaseReturnInvoice.tr,
  salesReturn: moduleTranslations.salesReturnInvoice.tr,
};

function typeText(kind: 'purchase_return' | 'sales_return'): string {
  return returnReportInvoiceTypeText(kind, TYPE_LABELS);
}

describe('İade Raporu', () => {
  it('menü ve başlık İade Raporu, kolon Fatura Türü', () => {
    const title = moduleTranslations.erpSalesReturnsTitle;
    expect(title.tr).toBe('İade Raporu');
    expect(title.en).toBe('Return report');
    expect(title.ar).toBe('تقرير المرتجعات');
    expect(title.ku).toBe('ڕاپۆرتی گەڕاندنەوە');
    expect(moduleTranslations.invoiceType.tr).toBe('Fatura Türü');
    expect(moduleTranslations.purchaseReturnInvoice.tr).toBe('Alış İade Faturası');
    expect(moduleTranslations.salesReturnInvoice.tr).toBe('Satış İade Faturası');
    expect(moduleTranslations.erpProductProfitTitle.tr).toBe('Ürün Brüt Kârı');

    const menu = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    expect(menu).toContain("{ key: 'sales-returns', label: tm('erpSalesReturnsTitle')");

    const screen = readFileSync(resolve('src/components/reports/ErpCoreReports.tsx'), 'utf8');
    const start = screen.indexOf('export function SalesReturnsReport');
    const end = screen.indexOf('export function ProductGrossProfitReport');
    const body = screen.slice(start, end);
    expect(body).toContain("title={tm('erpSalesReturnsTitle')}");
    expect(body).not.toContain('Satış İadeleri');
    const fiche = body.indexOf("key: 'ficheNo'");
    const invoiceType = body.indexOf("key: 'invoiceTypeName'");
    const date = body.indexOf("key: 'date'");
    expect(fiche).toBeGreaterThan(-1);
    expect(invoiceType).toBeGreaterThan(fiche);
    expect(date).toBeGreaterThan(invoiceType);
    expect(body).toContain("header: tm('invoiceType')");
    expect(body).toContain('formatNumber(r.netAmount, 2, false)');
  });

  it('00003 alış iadesi ve 00002 satış iadesi; tutarlar 25.000 ve 15.000', () => {
    const rows = mapReturnReportRows([
      {
        id: 'purchase',
        fiche_no: '00003',
        date: '2026-10-25',
        customer_name: 'ALI RASID',
        payment_method: 'cash',
        net_amount: 25000,
        trcode: 6,
        fiche_type: 'return_invoice',
        is_deposit: false,
      },
      {
        id: 'sales',
        fiche_no: '00002',
        date: '2026-10-25',
        customer_name: 'ROZA',
        payment_method: 'cash',
        net_amount: 15000,
        trcode: 3,
        fiche_type: 'return_invoice',
        is_deposit: false,
      },
    ]);

    expect(rows).toHaveLength(2);
    const purchase = rows.find((row) => row.ficheNo === '00003');
    const sales = rows.find((row) => row.ficheNo === '00002');

    expect(purchase?.trcode).toBe(6);
    expect(purchase?.ficheType).toBe('return_invoice');
    expect(purchase?.returnKind).toBe('purchase_return');
    expect(typeText(purchase!.returnKind)).toBe('Alış İade Faturası');
    expect(purchase?.netAmount).toBe(25000);
    expect(formatNumber(purchase!.netAmount, 2, false)).toBe('25.000');
    expect(purchase?.paymentMethod).toBe('cash');

    expect(sales?.trcode).toBe(3);
    expect(sales?.returnKind).toBe('sales_return');
    expect(typeText(sales!.returnKind)).toBe('Satış İade Faturası');
    expect(sales?.netAmount).toBe(15000);
    expect(formatNumber(sales!.netAmount, 2, false)).toBe('15.000');
    expect(sales?.paymentMethod).toBe('cash');

    expect(rows.reduce((sum, row) => sum + row.netAmount, 0)).toBe(40000);
    expect(formatNumber(40000, 2, false)).toBe('40.000');
  });

  it('cari adı türü değiştirmez; tutar işareti korunur', () => {
    const rows = mapReturnReportRows([
      {
        fiche_no: '00003',
        customer_name: 'ROZA',
        net_amount: 25000,
        trcode: 6,
        fiche_type: 'return_invoice',
        payment_method: 'cash',
      },
      {
        fiche_no: '00002',
        customer_name: 'ALI RASID',
        net_amount: 15000,
        trcode: 2,
        fiche_type: 'return_invoice',
        payment_method: 'cash',
      },
      {
        fiche_no: 'BELIRSIZ',
        customer_name: 'ALI RASID',
        net_amount: 9000,
        trcode: 0,
        fiche_type: 'return_invoice',
        payment_method: 'cash',
      },
    ]);

    expect(typeText(rows[0].returnKind)).toBe('Alış İade Faturası');
    expect(rows[0].accountName).toBe('ROZA');
    expect(rows[0].netAmount).toBe(25000);
    expect(typeText(rows[1].returnKind)).toBe('Satış İade Faturası');
    expect(rows[1].accountName).toBe('ALI RASID');
    expect(rows[1].trcode).toBe(2);
    expect(typeText(rows[2].returnKind)).toBe('Satış İade Faturası');

    const signed = mapReturnReportRow({
      fiche_no: 'EKSİ',
      trcode: 3,
      fiche_type: 'return_invoice',
      net_amount: -15000,
      payment_method: 'cash',
    });
    expect(signed?.netAmount).toBe(-15000);
    expect(signed?.returnKind).toBe('sales_return');
  });

  it('rezervasyon peşinatı düşer; indirim açık cari olmaz', () => {
    const rows = mapReturnReportRows([
      {
        fiche_no: '00003',
        customer_name: 'ALI RASID',
        net_amount: 25000,
        trcode: 6,
        fiche_type: 'return_invoice',
        payment_method: 'cash',
      },
      {
        fiche_no: 'PESINAT',
        customer_name: 'ROZA',
        net_amount: 20000,
        trcode: 3,
        fiche_type: 'return_invoice',
        is_deposit: true,
        notes: 'deposit:1',
        payment_method: 'cash',
      },
      {
        fiche_no: 'NOTPESINAT',
        customer_name: 'ROZA',
        net_amount: 5000,
        trcode: 3,
        fiche_type: 'return_invoice',
        notes: 'rex_appt:abc|deposit:1',
        payment_method: 'cash',
      },
      {
        fiche_no: '00002',
        customer_name: 'ROZA',
        net_amount: 15000,
        trcode: 3,
        fiche_type: 'return_invoice',
        payment_method: 'indirim',
        notes: 'iskonto',
      },
      {
        fiche_no: 'SATIS',
        customer_name: 'ROZA',
        net_amount: 8000,
        trcode: 8,
        fiche_type: 'sales_invoice',
        payment_method: 'indirim',
      },
    ]);

    expect(rows.map((row) => row.ficheNo)).toEqual(['00003', '00002']);
    const sales = rows[1];
    expect(sales.accountName).toBe('ROZA');
    expect(sales.accountName.toLocaleLowerCase('tr-TR')).not.toContain('açık cari');
    expect(sales.paymentMethod).toBe('indirim');
    expect(sales.netAmount).toBe(15000);
    expect(typeText(sales.returnKind)).toBe('Satış İade Faturası');
    expect(rows.reduce((sum, row) => sum + row.netAmount, 0)).toBe(40000);
  });
});

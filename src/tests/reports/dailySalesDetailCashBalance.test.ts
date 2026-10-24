/**
 * Satış Detayları kasa bakiyesi.
 *
 * Dört fiş: indirim öncesi 140.000, indirim 1.500, net 138.500.
 * Rezervasyon 10.000 ciro değildir.
 * Ofis kirası / gider pusulası 5.000 çıkıştır.
 * Dip toplam 138.500 − 5.000 = 133.500.
 * İndirim +1.500 eklenmez (135.000 yanlış). İkinci gider düşümü 128.500 yanlıştır.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDailySalesDetailExpenseRows,
  dailySalesDetailExpenseNet,
  sumDailySalesDetailCashBalance,
} from '../../utils/dailySalesDetailCashBalance';
import { dailySalesDetailKindLabel, isDailySalesDetailReturn } from '../../utils/dailySalesDetailKind';
import { moduleTranslations } from '../../locales/module-translations';

const sales = [
  { receiptNumber: 'BEA-2026-00001', beforeDiscount: 50_000, total: 50_000, discount: 0 },
  { receiptNumber: 'BEA-2026-00002', beforeDiscount: 25_000, total: 25_000, discount: 0 },
  { receiptNumber: 'BEA-2026-00003', beforeDiscount: 50_000, total: 50_000, discount: 0 },
  { receiptNumber: 'BEA-2026-00004', beforeDiscount: 15_000, total: 15_000, discount: 1_500 },
];

const reservation = {
  receiptNumber: 'RSV-10',
  beforeDiscount: 10_000,
  total: 10_000,
  discount: 0,
  isAvans: true as const,
};

const officeRent = {
  key: 'kira',
  ficheNo: 'GDR-2026-00001',
  amount: 5_000,
  description: 'Ofis kirası',
  category: 'Gider pusulası',
  paymentMethod: 'cash',
  isCash: true,
};

const kindLabels = {
  service: 'Hizmet',
  product: 'Ürün',
  mixed: 'Karma',
  all: 'Tümü',
  reservation: 'Rezervasyon',
  return: 'İade',
  expense: 'Gider',
};

describe('satış detayları kasa bakiyesi', () => {
  const expenseRows = buildDailySalesDetailExpenseRows(sales, [officeRent], 'Gider');
  const table = [...sales, reservation, ...expenseRows];

  it('gider satırı tabloda eksi çıkar ve dip toplam 133.500 olur', () => {
    expect(expenseRows).toHaveLength(1);
    expect(expenseRows[0].receiptNumber).toBe('GDR-2026-00001');
    expect(expenseRows[0].customerName).toBe('Ofis kirası');
    expect(expenseRows[0].isExpense).toBe(true);
    expect(expenseRows[0].total).toBe(-5_000);
    expect(expenseRows[0].discount).toBe(0);
    expect(dailySalesDetailExpenseNet(expenseRows[0])).toBe(-5_000);
    expect(isDailySalesDetailReturn(expenseRows[0])).toBe(false);
    expect(dailySalesDetailKindLabel(expenseRows[0], kindLabels)).toBe('Gider');
    expect(sumDailySalesDetailCashBalance(table)).toBe(133_500);
  });

  it('indirim +1.500 eklenmez, ikinci kez düşülmez; rezervasyon toplama yazılmaz', () => {
    const cash = sumDailySalesDetailCashBalance(table);
    const discount = sales.reduce((sum, row) => sum + row.discount, 0);
    expect(discount).toBe(1_500);
    expect(cash + 5_000).toBe(138_500);
    expect(cash).not.toBe(138_500 + discount - 5_000);
    expect(cash).not.toBe(140_000 - 5_000);
    expect(cash).not.toBe(138_500 - discount - 5_000);
    expect(cash).not.toBe(138_500 - 5_000 - 5_000);
    expect(cash).not.toBe(138_500 + 10_000 - 5_000);
    expect(sumDailySalesDetailCashBalance(sales)).toBe(138_500);
    expect(sumDailySalesDetailCashBalance([...sales, reservation])).toBe(138_500);
  });

  it('aynı gider fişi ikinci kez eklenmez; satış fişiyle çakışan çıkış tekrar düşülmez', () => {
    expect(buildDailySalesDetailExpenseRows(sales, [officeRent, { ...officeRent, key: 'kira-2' }])).toHaveLength(1);
    const booked = buildDailySalesDetailExpenseRows(
      [{ receiptNumber: 'GDR-2026-00001', beforeDiscount: -5_000, total: -5_000, discount: 0 }],
      [officeRent],
    );
    expect(booked).toHaveLength(0);
    expect(sumDailySalesDetailCashBalance([
      ...sales,
      { receiptNumber: 'GDR-2026-00001', beforeDiscount: -5_000, total: -5_000, discount: 0, isExpense: true },
    ])).toBe(133_500);
  });

  it('ekran gider satırını ızgaraya bağlar ve Net (Brüt) kartını çizmez', () => {
    const src = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    expect(src).toContain('buildDailySalesDetailExpenseRows');
    expect(src).toContain('sumDailySalesDetailCashBalance');
    expect(src).toContain('data={dailySalesDetailGridRows}');
    expect(src).not.toContain("'net-gross'");
    expect(src).not.toContain('dailyNetBrutAlways');
    const pack = moduleTranslations.reportsDailyKindExpense;
    expect(pack.tr).toBe('Gider');
    expect(pack.en).toBe('Expense');
    expect(pack.ar).toBe('مصروف');
    expect(pack.ku).toBe('خەرجی');
  });
});

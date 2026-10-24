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
  dailyExpenseSourceHour,
  dailySalesDetailExpenseNet,
  sumDailySalesDetailCashBalance,
} from '../../utils/dailySalesDetailCashBalance';
import { dailySalesDetailKindLabel, isDailySalesDetailReturn } from '../../utils/dailySalesDetailKind';
import { moduleTranslations } from '../../locales/module-translations';
import { mergeExpensesWithCashOuts } from '../../utils/reportUnifiedExpenses';
import type { Expense } from '../../services/api/expenses';
import type { KasaIslemi } from '../../services/api/kasa';

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

  it('gider satırında fiş no, saat ve ekleyen kişi kaynak kayıttan gelir', () => {
    const createdAt = '2026-10-24T11:57:00';
    const names = new Map<string, string>([['user-admin', 'admin']]);
    const sourced = buildDailySalesDetailExpenseRows(
      sales,
      [{
        ...officeRent,
        description: 'EKİM KİRASI',
        createdAt,
        enteredById: 'user-admin',
        enteredByName: '',
      }],
      'Gider',
      names,
    );
    expect(sourced).toHaveLength(1);
    expect(sourced[0].receiptNumber).toBe('GDR-2026-00001');
    expect(sourced[0].hour).toBe(dailyExpenseSourceHour({ createdAt }));
    expect(sourced[0].hour).not.toBe('—');
    expect(sourced[0].hour).toContain('57');
    expect(sourced[0].cashier).toBe('admin');
    expect(sourced[0].cashier).not.toBe('EKİM KİRASI');
    expect(sourced[0].customerName).toBe('EKİM KİRASI');
    expect(sourced[0].total).toBe(-5_000);
    expect(sourced[0].discount).toBe(0);
    const table = [...sales, reservation, ...sourced];
    expect(sumDailySalesDetailCashBalance(table)).toBe(133_500);

    const missing = buildDailySalesDetailExpenseRows(sales, [{
      key: 'bos',
      amount: 5_000,
      date: '2026-10-24',
      createdAt: '2026-10-24',
      description: 'EKİM KİRASI',
      paymentMethod: 'cash',
      isCash: true,
    }]);
    expect(missing[0].receiptNumber).toBe('—');
    expect(missing[0].hour).toBe('—');
    expect(missing[0].cashier).toBe('—');
    expect(missing[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...missing])).toBe(133_500);

    const noon = buildDailySalesDetailExpenseRows(sales, [{
      key: 'ogle',
      ficheNo: 'GDR-2026-00001',
      amount: 5_000,
      date: '2026-10-24',
      createdAt: '2026-10-24T12:00:00.000Z',
      description: 'EKİM KİRASI',
      paymentMethod: 'cash',
      isCash: true,
    }]);
    expect(noon[0].receiptNumber).toBe('GDR-2026-00001');
    expect(noon[0].hour).toBe('—');
    expect(noon[0].total).toBe(-5_000);
  });

  it('bağlı kasa fişi belge no boşsa fiş no ve saat kayıttan gelir; tutar bir kez düşülür', () => {
    const expense = {
      id: 'exp-ekim',
      category: 'Kira',
      description: 'EKİM KİRASI',
      amount: 5_000,
      payment_method: 'cash',
      store_id: '',
      expense_date: '2026-10-24',
      document_number: '',
      created_by: 'user-admin',
      created_at: '',
      firm_nr: '001',
      cash_line_id: 'line-ekim',
    } as Expense;
    const cash = {
      id: 'line-ekim',
      firma_id: '001',
      kasa_id: 'reg-1',
      islem_tarihi: '2026-10-24',
      islem_tipi: 'GIDER_PUSULASI',
      islem_aciklamasi: 'EKİM KİRASI',
      islem_no: 'GDR-2026-00001',
      tutar: 5_000,
      olusturma_tarihi: '2026-10-24T11:57:00',
    } as KasaIslemi;
    const unified = mergeExpensesWithCashOuts([expense], [cash]);
    expect(unified).toHaveLength(1);
    expect(unified[0].amount).toBe(5_000);
    expect(unified[0].document_number).toBe('GDR-2026-00001');
    expect(unified[0].created_at).toBe('2026-10-24T11:57:00');
    expect(unified[0].created_by).toBe('user-admin');

    const kept = mergeExpensesWithCashOuts(
      [{ ...expense, document_number: 'BELGE-9', created_at: '2026-10-24T08:01:00' }],
      [{ ...cash, islem_no: 'BASKA-1', olusturma_tarihi: '2026-10-24T09:00:00' }],
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].document_number).toBe('BELGE-9');
    expect(kept[0].created_at).toBe('2026-10-24T08:01:00');
    expect(kept[0].amount).toBe(5_000);

    const names = new Map<string, string>([['user-admin', 'admin']]);
    const rows = buildDailySalesDetailExpenseRows(sales, [{
      key: unified[0].id,
      ficheNo: unified[0].document_number,
      amount: unified[0].amount,
      date: unified[0].expense_date,
      createdAt: unified[0].created_at,
      enteredById: unified[0].created_by,
      description: unified[0].description,
      paymentMethod: unified[0].payment_method,
      isCash: true,
    }], 'Gider', names);
    expect(rows[0].receiptNumber).toBe('GDR-2026-00001');
    expect(rows[0].hour).toContain('57');
    expect(rows[0].cashier).toBe('admin');
    expect(rows[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...rows])).toBe(133_500);

    const onlyCash = mergeExpensesWithCashOuts([], [{ ...cash, id: 'line-nakit' }]);
    expect(onlyCash).toHaveLength(1);
    expect(onlyCash[0].amount).toBe(5_000);
    expect(onlyCash[0].document_number).toBe('GDR-2026-00001');
    expect(onlyCash[0].created_at).toBe('2026-10-24T11:57:00');
    expect(String(onlyCash[0].created_by || '')).toBe('');
    const cashRows = buildDailySalesDetailExpenseRows(sales, [{
      key: String(onlyCash[0].id),
      ficheNo: onlyCash[0].document_number,
      amount: onlyCash[0].amount,
      date: onlyCash[0].expense_date,
      createdAt: onlyCash[0].created_at,
      enteredById: onlyCash[0].created_by,
      description: onlyCash[0].description,
      paymentMethod: 'cash',
      isCash: true,
    }], 'Gider', names);
    expect(cashRows[0].receiptNumber).toBe('GDR-2026-00001');
    expect(cashRows[0].hour).toContain('57');
    expect(cashRows[0].cashier).toBe('—');
    expect(cashRows[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...cashRows])).toBe(133_500);
  });

  it('ekran gider satırını ızgaraya bağlar ve Net (Brüt) kartını çizmez', () => {
    const src = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    expect(src).toContain('buildDailySalesDetailExpenseRows');
    expect(src).toContain('sumDailySalesDetailCashBalance');
    expect(src).toContain('createdAt: row.createdAt');
    expect(src).toContain('enteredById: row.enteredById');
    expect(src).toContain('cashier: row.cashier');
    expect(src).toContain('hour: row.hour');
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

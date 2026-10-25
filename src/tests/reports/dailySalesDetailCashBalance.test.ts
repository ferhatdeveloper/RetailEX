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
  dailyReportScreenNetCash,
  dailySalesDetailExpenseNet,
  sumDailySalesDetailCashBalance,
} from '../../utils/dailySalesDetailCashBalance';
import { dailySalesDetailKindLabel, isDailySalesDetailReturn } from '../../utils/dailySalesDetailKind';
import { moduleTranslations } from '../../locales/module-translations';
import { mergeExpensesWithCashOuts } from '../../utils/reportUnifiedExpenses';
import { cashStatusWithVouchers } from '../../utils/cashStatusTotals';
import { expenseCashBalanceDeltaOnDelete } from '../../services/api/expenses';
import { readCashLineActor } from '../../utils/cashLineActor';
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

describe('günlük rapor net nakit — 50.000 hizmet, 10.000 gider', () => {
  it('ciro 50.000 kalır, gider bir kez düşer, net nakit 40.000; peşinat ikinci kez yok', () => {
    const service = {
      receiptNumber: 'BEA-2026-00001',
      beforeDiscount: 50_000,
      total: 50_000,
      discount: 0,
    };
    const avans = {
      receiptNumber: 'AVANS-fb429b84',
      beforeDiscount: 10_000,
      total: 10_000,
      discount: 0,
      isAvans: true as const,
    };
    const rent = {
      receiptNumber: 'KL-MVN00AQ-G3CJUB',
      beforeDiscount: 0,
      total: -10_000,
      discount: 0,
      isExpense: true,
    };
    const revenue = service.total;
    const expense = 10_000;
    const net = dailyReportScreenNetCash([service, avans, rent]);
    expect(revenue).toBe(50_000);
    expect(expense).toBe(10_000);
    expect(net).toBe(40_000);
    expect(net).toBe(revenue - expense);
    expect(net).not.toBe(50_000);
    expect(net).not.toBe(60_000);
    expect(dailyReportScreenNetCash([service, avans])).toBe(50_000);
  });
});

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

  it('created_by boşken kasa satırındaki kullanıcı adı kasiyer olur; ikisi de boşsa —', () => {
    const expense = {
      id: 'exp-ekim',
      category: 'Kira',
      description: 'EKİM KİRASI',
      amount: 5_000,
      payment_method: 'cash',
      store_id: '',
      expense_date: '2026-10-24',
      document_number: '',
      created_by: '',
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
      cari_hesap_unvani: 'EKİM KİRASI',
      islem_no: 'KL-MVM0ETHL8-9TF896',
      tutar: 5_000,
      olusturma_tarihi: '2026-10-24T12:02:00',
      cashier: 'Ayşe',
      created_by: '',
      user_id: '',
    } as KasaIslemi;
    const actor = readCashLineActor(cash);
    expect(actor.nameColumn).toBe('cashier');
    expect(actor.name).toBe('Ayşe');
    expect(actor.id).toBe('');

    const unified = mergeExpensesWithCashOuts([expense], [cash]);
    expect(unified).toHaveLength(1);
    expect(unified[0].amount).toBe(5_000);
    expect(unified[0].created_by).toBe('');
    expect(unified[0].entered_by_name).toBe('Ayşe');
    expect(unified[0].document_number).toBe('KL-MVM0ETHL8-9TF896');

    const names = new Map<string, string>([['user-admin', 'admin']]);
    const rows = buildDailySalesDetailExpenseRows(sales, [{
      key: unified[0].id,
      ficheNo: unified[0].document_number,
      amount: unified[0].amount,
      date: unified[0].expense_date,
      createdAt: unified[0].created_at,
      enteredById: unified[0].created_by,
      enteredByName: unified[0].entered_by_name,
      description: unified[0].description,
      paymentMethod: unified[0].payment_method,
      isCash: true,
    }], 'Gider', names);
    expect(rows[0].receiptNumber).toBe('KL-MVM0ETHL8-9TF896');
    expect(rows[0].cashier).toBe('Ayşe');
    expect(rows[0].cashier).not.toBe('admin');
    expect(rows[0].cashier).not.toBe('EKİM KİRASI');
    expect(rows[0].customerName).toBe('EKİM KİRASI');
    expect(rows[0].discount).toBe(0);
    expect(rows[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...rows])).toBe(133_500);

    const blankCash = {
      ...cash,
      id: 'line-bos',
      cashier: '',
      created_by: '',
      user_id: '',
      created_by_user_id: '',
      olusturan: '',
      kaydeden: '',
      username: '',
    } as KasaIslemi;
    const blankActor = readCashLineActor(blankCash);
    expect(blankActor.name).toBe('');
    expect(blankActor.id).toBe('');
    expect(blankActor.emptyColumns).toEqual(expect.arrayContaining([
      'cashier',
      'created_by',
      'user_id',
      'olusturan',
      'kaydeden',
    ]));
    const blankUnified = mergeExpensesWithCashOuts(
      [{ ...expense, id: 'exp-bos', cash_line_id: 'line-bos' }],
      [blankCash],
    );
    expect(blankUnified).toHaveLength(1);
    expect(blankUnified[0].amount).toBe(5_000);
    expect(String(blankUnified[0].created_by || '')).toBe('');
    expect(String(blankUnified[0].entered_by_name || '')).toBe('');
    const blankRows = buildDailySalesDetailExpenseRows(sales, [{
      key: String(blankUnified[0].id),
      ficheNo: blankUnified[0].document_number,
      amount: blankUnified[0].amount,
      date: blankUnified[0].expense_date,
      createdAt: blankUnified[0].created_at,
      enteredById: blankUnified[0].created_by,
      enteredByName: blankUnified[0].entered_by_name,
      description: 'EKİM KİRASI',
      paymentMethod: 'cash',
      isCash: true,
    }], 'Gider', names);
    expect(blankRows[0].cashier).toBe('—');
    expect(blankRows[0].discount).toBe(0);
    expect(blankRows[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...blankRows])).toBe(133_500);

    const idOnly = mergeExpensesWithCashOuts([], [{
      ...blankCash,
      id: 'line-kimlik',
      user_id: 'user-ayse',
      cashier: '',
    }]);
    expect(idOnly).toHaveLength(1);
    expect(idOnly[0].amount).toBe(5_000);
    expect(idOnly[0].created_by).toBe('user-ayse');
    const idNames = new Map<string, string>([['user-ayse', 'Ayşe']]);
    const idRows = buildDailySalesDetailExpenseRows(sales, [{
      key: String(idOnly[0].id),
      ficheNo: idOnly[0].document_number,
      amount: idOnly[0].amount,
      date: idOnly[0].expense_date,
      createdAt: idOnly[0].created_at,
      enteredById: idOnly[0].created_by,
      enteredByName: idOnly[0].entered_by_name,
      description: 'EKİM KİRASI',
      paymentMethod: 'cash',
      isCash: true,
    }], 'Gider', idNames);
    expect(readCashLineActor(idOnly[0] ? { user_id: 'user-ayse' } : {}).idColumn).toBe('user_id');
    expect(idRows[0].cashier).toBe('Ayşe');
    expect(idRows[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...idRows])).toBe(133_500);
  });

  it('KL fişinde kasiyer admin ise admin, boşsa tire; Kasa giriş açıklamadır; tutar aynı kalır', () => {
    const createdAt = '2026-10-24T16:33:00';
    const userId = '11111111-1111-4111-8111-111111111111';
    const names = new Map<string, string>([[userId, 'admin']]);
    const baseCash = {
      id: 'line-kasa-giris',
      firma_id: '001',
      kasa_id: 'reg-1',
      islem_tarihi: '2026-10-24',
      islem_tipi: 'KASA_CIKIS',
      islem_aciklamasi: 'Kasa giriş',
      cari_hesap_unvani: '',
      islem_no: 'KL-MVMFWBU2-CU5ZA',
      tutar: 5_000,
      olusturma_tarihi: createdAt,
    } as KasaIslemi;

    const withName = mergeExpensesWithCashOuts([], [{ ...baseCash, cashier: 'admin' }]);
    expect(withName).toHaveLength(1);
    expect(withName[0].amount).toBe(5_000);
    expect(withName[0].description).toBe('Kasa giriş');
    expect(withName[0].entered_by_name).toBe('admin');
    expect(withName[0].document_number).toBe('KL-MVMFWBU2-CU5ZA');
    const namedRows = buildDailySalesDetailExpenseRows(sales, [{
      key: String(withName[0].id),
      ficheNo: withName[0].document_number,
      amount: withName[0].amount,
      date: withName[0].expense_date,
      createdAt: withName[0].created_at,
      enteredById: withName[0].created_by,
      enteredByName: withName[0].entered_by_name,
      description: withName[0].description,
      category: withName[0].category,
      paymentMethod: 'cash',
      isCash: true,
    }], 'Gider', names);
    expect(namedRows[0].receiptNumber).toBe('KL-MVMFWBU2-CU5ZA');
    expect(namedRows[0].hour).toContain('33');
    expect(namedRows[0].cashier).toBe('admin');
    expect(namedRows[0].customerName).toBe('Kasa giriş');
    expect(namedRows[0].discount).toBe(0);
    expect(namedRows[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...namedRows])).toBe(133_500);

    expect(readCashLineActor({ ...baseCash, cashier: 'Kasa giriş' }).name).toBe('');
    const blank = mergeExpensesWithCashOuts([], [{
      ...baseCash,
      id: 'line-bos',
      cashier: 'Kasa giriş',
      created_by_user_id: '',
      created_by: '',
      user_id: '',
    }]);
    expect(blank).toHaveLength(1);
    expect(blank[0].amount).toBe(5_000);
    expect(String(blank[0].entered_by_name || '')).toBe('');
    expect(blank[0].description).toBe('Kasa giriş');
    const blankRows = buildDailySalesDetailExpenseRows(sales, [{
      key: String(blank[0].id),
      ficheNo: blank[0].document_number,
      amount: blank[0].amount,
      date: blank[0].expense_date,
      createdAt: blank[0].created_at,
      enteredById: blank[0].created_by,
      enteredByName: blank[0].entered_by_name,
      description: blank[0].description,
      paymentMethod: 'cash',
      isCash: true,
    }], 'Gider', names);
    expect(blankRows).toHaveLength(1);
    expect(blankRows[0].cashier).toBe('—');
    expect(blankRows[0].customerName).toBe('Kasa giriş');
    expect(blankRows[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...blankRows])).toBe(133_500);

    const idOnly = mergeExpensesWithCashOuts([], [{
      ...baseCash,
      id: 'line-uuid',
      cashier: '',
      created_by_user_id: userId,
    }]);
    const idRows = buildDailySalesDetailExpenseRows(sales, [{
      key: String(idOnly[0].id),
      ficheNo: idOnly[0].document_number,
      amount: idOnly[0].amount,
      date: idOnly[0].expense_date,
      createdAt: idOnly[0].created_at,
      enteredById: idOnly[0].created_by,
      enteredByName: idOnly[0].entered_by_name,
      description: 'Kasa giriş',
      paymentMethod: 'cash',
      isCash: true,
    }], 'Gider', names);
    expect(idRows[0].cashier).toBe('admin');
    expect(idRows[0].customerName).toBe('Kasa giriş');
    expect(idRows[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...idRows])).toBe(133_500);

    const unmapped = buildDailySalesDetailExpenseRows(sales, [{
      key: 'no-map',
      ficheNo: 'KL-MVMFWBU2-CU5ZA',
      amount: 5_000,
      date: '2026-10-24',
      createdAt,
      enteredById: '22222222-2222-4222-8222-222222222222',
      enteredByName: '',
      description: 'Kasa giriş',
      paymentMethod: 'cash',
      isCash: true,
    }], 'Gider', names);
    expect(unmapped[0].cashier).toBe('—');
    expect(unmapped[0].customerName).toBe('Kasa giriş');
    expect(unmapped[0].total).toBe(-5_000);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...unmapped])).toBe(133_500);
  });

  it('ekran gider satırını ızgaraya bağlar ve Net (Brüt) kartını çizmez', () => {
    const src = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    expect(src).toContain('buildDailySalesDetailExpenseRows');
    expect(src).toContain('sumDailySalesDetailCashBalance');
    expect(src).toContain('createdAt: row.createdAt');
    expect(src).toContain('enteredById: row.enteredById');
    expect(src).toContain('enteredById: enteredBy.id');
    expect(src).toContain('enteredByName: enteredBy.name');
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

describe('silinen kasa çıkışı günlük rapordan düşer', () => {
  const day = '2026-10-24';
  const deletedFiche = 'KL-MVMFWBU2-CU5ZA';
  const salaryFiche = 'KL-MVMHZNQ-A4RML';
  const mirror = {
    id: 'exp-kasa-giris',
    category: 'Gider',
    description: 'Kasa giriş',
    amount: 5_000,
    payment_method: 'cash',
    store_id: '',
    expense_date: day,
    document_number: deletedFiche,
    created_by: '',
    firm_nr: '001',
    cash_line_id: 'line-kasa-giris',
  } as Expense;

  const salary = {
    id: 'line-maas',
    firma_id: '001',
    kasa_id: 'reg-1',
    islem_tarihi: day,
    islem_tipi: 'MAAS_ODEME',
    islem_aciklamasi: 'maaş ödemesi',
    islem_no: salaryFiche,
    tutar: 10_000,
    sign: -1,
  } as KasaIslemi;

  const deletedCash = {
    id: 'line-kasa-giris',
    firma_id: '001',
    kasa_id: 'reg-1',
    islem_tarihi: day,
    islem_tipi: 'KASA_CIKIS',
    islem_aciklamasi: 'Kasa giriş',
    islem_no: deletedFiche,
    tutar: 5_000,
    sign: -1,
  } as KasaIslemi;

  const virman = {
    id: 'line-virman',
    firma_id: '001',
    kasa_id: 'reg-1',
    target_register_id: 'reg-2',
    islem_tarihi: day,
    islem_tipi: 'VIRMAN',
    islem_aciklamasi: 'Kasa virmanı',
    islem_no: 'KL-VIRMAN-1',
    tutar: 7_000,
    sign: -1,
  } as KasaIslemi;

  function giderOf(rows: readonly { amount?: number | null }[]): number {
    return rows.reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0);
  }

  it('kasa çıkışı silinince birleşik listede o fiş yok, tutar bir kez düşer, maaş kalır, net 128.500', () => {
    const before = mergeExpensesWithCashOuts(
      [mirror],
      [deletedCash, salary, virman],
      { omitOrphanCashMirrors: true },
    );
    expect(giderOf(before)).toBe(15_000);
    expect(before.some((row) => row.document_number === deletedFiche)).toBe(true);
    expect(before.some((row) => row.document_number === salaryFiche)).toBe(true);
    expect(before.some((row) => row.notes === 'VIRMAN')).toBe(false);

    const after = mergeExpensesWithCashOuts(
      [mirror],
      [salary, virman],
      { omitOrphanCashMirrors: true },
    );
    expect(after.some((row) => row.document_number === deletedFiche || row.cash_line_id === 'line-kasa-giris')).toBe(false);
    expect(after.some((row) => row.document_number === salaryFiche)).toBe(true);
    expect(after).toHaveLength(1);
    expect(giderOf(after)).toBe(10_000);
    expect(giderOf(before) - giderOf(after)).toBe(5_000);
    expect(expenseCashBalanceDeltaOnDelete(5_000, -1)).toBe(5_000);

    const rows = buildDailySalesDetailExpenseRows(sales, after.map((row) => ({
      key: String(row.id),
      ficheNo: row.document_number,
      amount: row.amount,
      date: row.expense_date,
      description: row.description,
      category: row.category,
      paymentMethod: 'cash',
      isCash: true,
    })), 'Gider');
    expect(rows).toHaveLength(1);
    expect(rows[0].receiptNumber).toBe(salaryFiche);
    expect(rows[0].customerName).toBe('maaş ödemesi');
    expect(rows[0].total).toBe(-10_000);
    expect(rows.some((row) => row.receiptNumber === deletedFiche)).toBe(false);

    const ciro = sales.reduce((sum, row) => sum + row.beforeDiscount, 0);
    const indirim = sales.reduce((sum, row) => sum + row.discount, 0);
    expect(ciro).toBe(140_000);
    expect(indirim).toBe(1_500);
    expect(reservation.total).toBe(10_000);
    expect(sumDailySalesDetailCashBalance(sales)).toBe(138_500);
    expect(sumDailySalesDetailCashBalance([...sales, reservation, ...rows])).toBe(128_500);

    const voucher = cashStatusWithVouchers({
      salesCash: 138_500,
      reservation: 10_000,
      discount: 1_500,
      expense: giderOf(after),
      countedExpenseKeys: [salaryFiche, salary.id],
      lines: [salary, virman],
      saleReceiptKeys: sales.map((row) => row.receiptNumber),
      customerCollectionsInSalesCash: true,
    });
    expect(voucher.expense).toBe(10_000);
    expect(voucher.todayCash).toBe(138_500);
    expect(voucher.openAccount).toBe(0);
    expect(voucher.reservation).toBe(10_000);
    expect(voucher.grandTotal).toBe(128_500);
    expect(sales.map((row) => row.receiptNumber)).toEqual([
      'BEA-2026-00001',
      'BEA-2026-00002',
      'BEA-2026-00003',
      'BEA-2026-00004',
    ]);
  });
});

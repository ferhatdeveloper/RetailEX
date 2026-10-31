import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleTranslations } from '../locales/module-translations';
import { resolveDailyExpenseRowClick } from './dailyExpenseRowClick';
import {
  EXPENSE_ENTRY_CASH_LABEL,
  EXPENSE_ENTRY_FIELD_ORDER,
  expenseEntryDocumentAndCashBeforeAmount,
  isExpenseFicheConflict,
  nextExpenseFicheNo,
} from './expenseFicheNo';

describe('gider fiş numarası', () => {
  it('kayıt yoksa 000001, sonraki 000002', () => {
    expect(nextExpenseFicheNo([])).toBe('000001');
    expect(nextExpenseFicheNo(['000001'])).toBe('000002');
    expect(nextExpenseFicheNo(['000001', '000002'])).toBe('000003');
  });

  it('numarasız ve metin belge no sırayı bozmaz, max+1 üretir', () => {
    expect(nextExpenseFicheNo(['', null, 'BELGE NO', 'EXP-1', '000004'])).toBe('000005');
    expect(nextExpenseFicheNo([{ fiche_no: '000010' }, { fiche_no: null }])).toBe('000011');
  });

  it('kasa fiş çakışması gider fişi sanılmaz', () => {
    expect(isExpenseFicheConflict({
      code: '23505',
      message: 'duplicate key value violates unique constraint "rex_002_expenses_fiche_no_uidx"',
    })).toBe(true);
    expect(isExpenseFicheConflict({
      code: '23505',
      message: 'duplicate key value violates unique constraint "rex_002_01_cash_lines_fiche_no_key"',
    })).toBe(false);
    expect(isExpenseFicheConflict({
      name: 'ExpenseSaveError',
      expenseSaved: true,
      message: 'duplicate rex_002_expenses_fiche_no_uidx',
    })).toBe(false);
  });
});

describe('gider detay modeli', () => {
  it('notu ve belge no’dan ayrı fiş no’yu taşır', () => {
    const opened = resolveDailyExpenseRowClick({
      ficheNo: '000001',
      documentNo: 'BELGE NO',
      notes: 'OFIS KIRA notu',
      cashRegisterLabel: 'KASA.001 - MERKEZ KASA',
      timeLabel: '23:57',
      typeLabel: 'Gider pusulası',
      category: 'rent',
      description: 'OFIS KIRA',
      amount: 1000,
      currencyCode: 'IQD',
      baseAmount: 1000,
      payLabel: 'Nakit',
    });
    expect(opened.action).toBe('detail');
    if (opened.action !== 'detail') return;
    expect(opened.detail.ficheNo).toBe('000001');
    expect(opened.detail.documentNo).toBe('BELGE NO');
    expect(opened.detail.ficheNo).not.toBe(opened.detail.documentNo);
    expect(opened.detail.notes).toBe('OFIS KIRA notu');
    expect(opened.detail.cashRegisterLabel).toBe('KASA.001 - MERKEZ KASA');
    expect(opened.detail.amount).toBe(1000);
    expect(opened.detail.baseAmount).toBe(1000);
  });

  it('boş not Not yok olur', () => {
    const opened = resolveDailyExpenseRowClick({
      ficheNo: '000002',
      documentNo: '',
      notes: '   ',
    });
    expect(opened.action).toBe('detail');
    if (opened.action !== 'detail') return;
    expect(opened.detail.notes).toBe('Not yok');
    expect(opened.detail.documentNo).toBe('—');
    expect(opened.detail.ficheNo).toBe('000002');
  });
});

describe('gider giriş alanı sırası', () => {
  it('belge no ve kasa, tutar ile ödeme yönteminden önce; etiket Kasa', () => {
    expect(expenseEntryDocumentAndCashBeforeAmount()).toBe(true);
    expect(EXPENSE_ENTRY_CASH_LABEL).toBe('Kasa');
    expect(moduleTranslations.costCenterCashRegister.tr).toBe('Kasa');
    const order = [...EXPENSE_ENTRY_FIELD_ORDER];
    expect(order.indexOf('documentNo')).toBeLessThan(order.indexOf('amount'));
    expect(order.indexOf('cashRegister')).toBeLessThan(order.indexOf('amount'));
    expect(order.indexOf('documentNo')).toBeLessThan(order.indexOf('paymentMethod'));
    expect(order.indexOf('cashRegister')).toBeLessThan(order.indexOf('paymentMethod'));
    expect(order.indexOf('category')).toBeLessThan(order.indexOf('description'));
    expect(order.indexOf('notes')).toBeGreaterThan(order.indexOf('paymentMethod'));

    const src = readFileSync(
      resolve('src/components/accounting/reports/ExpenseManagement.tsx'),
      'utf8',
    );
    const fields = [...src.matchAll(/data-expense-field="([^"]+)"/g)].map((match) => match[1]);
    expect(fields).toEqual(order);
    const form = src.slice(
      src.indexOf('data-expense-field="category"'),
      src.indexOf('data-expense-field="attachment"'),
    );
    expect(form).toContain("tm('costCenterCashRegister')");
    expect(form).not.toContain("tm('manage')");
  });
});

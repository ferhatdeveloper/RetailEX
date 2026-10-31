import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { moduleTranslations } from '../locales/module-translations';
import { resolveDailyExpenseRowClick } from './dailyExpenseRowClick';
import {
  EXPENSE_ENTRY_CASH_LABEL,
  EXPENSE_ENTRY_FIELD_ORDER,
  expenseEntryDocumentAndCashBeforeAmount,
  isExpenseFicheConflict,
  nextExpenseFicheNo,
} from './expenseFicheNo';

const schemaRetryMocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  cash: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../services/postgres', () => ({
  postgres: { query: schemaRetryMocks.query },
  ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
  DB_SETTINGS: { connectionProvider: 'rest_api' },
}));

vi.mock('../services/api/kasa', () => ({
  createKasaIslemi: schemaRetryMocks.cash,
  deleteKasaIslemi: vi.fn(),
  ensureCashLineActorColumns: vi.fn(),
}));

vi.mock('../services/api/cashFxResolve', () => ({
  loadBookCurrencies: vi.fn(async () => ({ baseCurrency: 'TRY' })),
  resolveRegisterCashFx: vi.fn(async ({ cashAmount }: { cashAmount: number }) => ({
    cashAmount,
    cashCurrency: 'TRY',
    baseAmount: cashAmount,
    exchangeRate: 1,
  })),
}));

vi.mock('../services/api/postgrestClient', () => ({
  postgrest: {
    post: schemaRetryMocks.post,
    get: schemaRetryMocks.get,
    patch: schemaRetryMocks.patch,
    delete: vi.fn(),
  },
}));

const FICHE_SCHEMA_MISS = 'PostgREST POST /rex_001_expenses: 400 — {"code":"PGRST204","details":null,"hint":null,"message":"Could not find the \'fiche_no\' column of \'rex_001_expenses\' in the schema cache"}';

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
    expect(order[0]).toBe('ficheNo');
    expect(order[1]).toBe('date');
    expect(order.indexOf('ficheNo')).toBeLessThan(order.indexOf('category'));
    expect(order.indexOf('date')).toBeLessThan(order.indexOf('category'));
    expect(order.indexOf('category')).toBeLessThan(order.indexOf('description'));
    expect(order.indexOf('category')).toBeLessThan(order.indexOf('documentNo'));
    expect(order.indexOf('notes')).toBeGreaterThan(order.indexOf('paymentMethod'));
    expect(order.indexOf('attachment')).toBe(order.length - 1);

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
    expect(form).not.toContain('border-dashed');
    const saveSrc = readFileSync(resolve('src/services/api/expenses.ts'), 'utf8');
    const migration = readFileSync(resolve('database/migrations/218_expense_fiche_no.sql'), 'utf8');
    expect(saveSrc).toContain(`NOTIFY pgrst, 'reload schema'`);
    expect(migration).toContain(`pg_notify('pgrst', 'reload schema')`);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS fiche_no VARCHAR(20)');
  });
});

describe('gider kayıt şema önbelleği', () => {
  it('PGRST204 fiş no için şemayı yeniler, aynı gövdeyi bir kez daha yazar, kasa satırı açmaz', async () => {
    const { postExpenseWithFicheSchemaRetry } = await import('../services/api/expenses');
    const posts: Array<Record<string, unknown>> = [];
    const reloads: string[] = [];
    const cash: string[] = [];
    let attempt = 0;
    const saved = await postExpenseWithFicheSchemaRetry({
      body: { fiche_no: '000001', amount: 2500, payment_method: 'cash' },
      wait: async () => {},
      reloadSchema: async () => {
        reloads.push(`NOTIFY pgrst, 'reload schema'`);
      },
      post: async (body) => {
        posts.push({ ...body });
        attempt += 1;
        if (attempt === 1) throw new Error(FICHE_SCHEMA_MISS);
        return { id: 'row-1', fiche_no: body.fiche_no };
      },
    });
    expect(reloads).toEqual([
      `NOTIFY pgrst, 'reload schema'`,
      `NOTIFY pgrst, 'reload schema'`,
    ]);
    expect(posts).toHaveLength(2);
    expect(posts[0].fiche_no).toBe('000001');
    expect(posts[1].fiche_no).toBe('000001');
    expect(Object.prototype.hasOwnProperty.call(posts[1], 'fiche_no')).toBe(true);
    expect(cash).toEqual([]);
    expect(saved).toMatchObject({ id: 'row-1', fiche_no: '000001' });
  });

  it('kayıt yolu nakit giderde kasa satırını bir kez yazar', async () => {
    schemaRetryMocks.post.mockReset();
    schemaRetryMocks.get.mockReset();
    schemaRetryMocks.patch.mockReset();
    schemaRetryMocks.cash.mockReset();
    schemaRetryMocks.query.mockReset();

    const order: string[] = [];
    let expensePosts = 0;
    schemaRetryMocks.get.mockImplementation(async (path: string) => {
      if (String(path).includes('cash_registers')) {
        return [{ id: '11111111-1111-4111-8111-111111111111', code: 'KASA.001', currency_code: 'TRY' }];
      }
      return [];
    });
    schemaRetryMocks.post.mockImplementation(async (path: string, body: Record<string, unknown>) => {
      const target = String(path);
      if (target.includes('ensure_firm_expense_tables')) {
        order.push('reload');
        return null;
      }
      if (target.includes('expenses')) {
        expensePosts += 1;
        order.push(`post:${String(body?.fiche_no ?? '')}`);
        if (expensePosts === 1) throw new Error(FICHE_SCHEMA_MISS);
        return [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ...body }];
      }
      throw new Error(`beklenmeyen post ${target}`);
    });
    schemaRetryMocks.patch.mockImplementation(async () => ([
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cash_line_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    ]));
    schemaRetryMocks.cash.mockImplementation(async () => {
      order.push('cash');
      return { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
    });

    const { expenseAPI } = await import('../services/api/expenses');
    const saved = await expenseAPI.create({
      category: 'rent',
      description: 'Kira',
      amount: 2500,
      payment_method: 'cash',
      document_number: 'BELGE',
      expense_date: '2026-10-31',
      notes: 'not',
      created_by: '',
      store_id: '',
    });

    const posts = order.filter((step) => step.startsWith('post:'));
    expect(expensePosts).toBe(2);
    expect(posts).toEqual(['post:000001', 'post:000001']);
    expect(schemaRetryMocks.cash).toHaveBeenCalledTimes(1);
    expect(order.filter((step) => step === 'cash')).toEqual(['cash']);
    const firstPost = order.indexOf('post:000001');
    const secondPost = order.indexOf('post:000001', firstPost + 1);
    expect(order.slice(0, firstPost)).toContain('reload');
    expect(order.slice(firstPost + 1, secondPost)).toContain('reload');
    expect(order.indexOf('cash')).toBeGreaterThan(secondPost);
    expect(schemaRetryMocks.query).not.toHaveBeenCalled();
    expect(saved?.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });
});

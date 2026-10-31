import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../store/useAuthStore';
import { currentLoginDisplayName } from '../../utils/loginCashierName';
import {
  applyCategoryRemovalToExpenses,
  categoryRemovalLeavesMoneyAndExpenseRows,
  expenseCategoryRemovalStatements,
  type LinkedExpenseRow,
} from '../../utils/expenseCategoryDelete';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../../services/postgres', () => ({
  postgres: {
    query: (...args: unknown[]) => queryMock(...args),
  },
  ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
  DB_SETTINGS: { connectionProvider: 'db' },
  PostgresConnection: {
    getInstance: () => ({
      query: (...args: unknown[]) => queryMock(...args),
    }),
  },
}));

import { expenseCategoryAPI } from '../../services/api/masterData';

type CategoryRow = { id: string; code: string; name: string; is_active: boolean };

describe('gider kategorisi silme', () => {
  const categoryId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    queryMock.mockReset();
  });

  it('silme planı kartı siler, pasif yapmaz, gider satırını ve tutarı bırakır', () => {
    const expenses: LinkedExpenseRow[] = [
      { id: 'e1', category: 'Misafir Gideri', category_id: categoryId, amount: 1800 },
      { id: 'e2', category: '', category_id: categoryId, amount: 75.5 },
      { id: 'e3', category: 'Kira', category_id: 'other', amount: 900 },
    ];
    const statements = expenseCategoryRemovalStatements({
      categoryId,
      storedLabel: 'Misafir Gideri',
      foreignKeys: [{
        schemaName: 'public',
        tableName: 'rex_001_expenses',
        idColumn: 'category_id',
        textColumn: 'category',
      }],
    });

    expect(categoryRemovalLeavesMoneyAndExpenseRows(statements)).toBe(true);
    expect(statements.some((statement) => /DELETE FROM public\.expense_categories/i.test(statement.sql))).toBe(true);
    expect(statements.some((statement) => /is_active\s*=\s*false/i.test(statement.sql))).toBe(false);
    expect(statements.some((statement) => /DELETE/i.test(statement.sql) && /rex_001_expenses|cash_lines/i.test(statement.sql))).toBe(false);

    const kept = applyCategoryRemovalToExpenses(expenses, categoryId, 'Misafir Gideri');
    expect(kept).toHaveLength(3);
    expect(kept[0]).toMatchObject({ id: 'e1', category: 'Misafir Gideri', category_id: null, amount: 1800 });
    expect(kept[1]).toMatchObject({ id: 'e2', category: 'Misafir Gideri', category_id: null, amount: 75.5 });
    expect(kept[2]).toMatchObject({ id: 'e3', category: 'Kira', category_id: 'other', amount: 900 });
  });

  it('Sil kategori kartını kaldırır, gider satırını silmez ve Pasif yazmaz', async () => {
    const categories: CategoryRow[] = [
      { id: categoryId, code: 'misafir_gideri', name: 'Misafir Gideri', is_active: true },
    ];
    const expenses: LinkedExpenseRow[] = [
      { id: 'e1', category: 'Misafir Gideri', category_id: categoryId, amount: 1800 },
    ];
    const cashLines = [{ id: 'c1', amount: -1800, category: 'Misafir Gideri' }];

    queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql);
      if (/is_active\s*=\s*false/i.test(text)) {
        throw new Error('pasif yazildi');
      }
      if (/\bamount\b/i.test(text) || /\bfiche_no\b/i.test(text)) {
        throw new Error('tutar veya fis no yazildi');
      }
      if (/DELETE/i.test(text) && !/expense_categories/i.test(text)) {
        throw new Error('gider veya kasa satiri silindi');
      }
      if (/SELECT id, code, name/i.test(text)) {
        const found = categories.filter((row) => row.id === params[0]);
        return { rows: found, rowCount: found.length };
      }
      if (/pg_constraint/i.test(text)) {
        return {
          rows: [{ schema_name: 'public', table_name: 'rex_001_expenses', id_column: 'category_id' }],
          rowCount: 1,
        };
      }
      if (/information_schema\.columns/i.test(text)) {
        return { rows: [{ column_name: 'category' }], rowCount: 1 };
      }
      if (/^\s*UPDATE/i.test(text)) {
        const id = String(params[0] || '');
        const label = String(params[1] || '');
        for (const row of expenses) {
          if (row.category_id !== id) continue;
          if (!String(row.category || '').trim()) row.category = label;
          row.category_id = null;
        }
        return { rows: [], rowCount: 1 };
      }
      if (/DELETE FROM public\.expense_categories/i.test(text)) {
        const index = categories.findIndex((row) => row.id === params[0]);
        if (index >= 0) categories.splice(index, 1);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const removed = await expenseCategoryAPI.remove(categoryId);
    expect(removed).toBe(true);
    expect(categories).toHaveLength(0);
    expect(expenses).toEqual([
      { id: 'e1', category: 'Misafir Gideri', category_id: null, amount: 1800 },
    ]);
    expect(cashLines).toEqual([{ id: 'c1', amount: -1800, category: 'Misafir Gideri' }]);
    const sql = queryMock.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).not.toMatch(/is_active\s*=\s*false/i);
    expect(sql).toMatch(/DELETE FROM public\.expense_categories/i);
  });

  it('yeni kategori ekleyen adını karta yazar', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 'u1', code: 'konaklama', name: 'KONAKLAMA', created_by_name: 'Aylin Kaya', is_active: true }],
      rowCount: 1,
    });
    await expenseCategoryAPI.create({
      code: 'konaklama',
      name: 'KONAKLAMA',
      created_by_name: 'Aylin Kaya',
    });
    const sql = String(queryMock.mock.calls[0][0]);
    const params = queryMock.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/created_by_name/);
    expect(params).toContain('Aylin Kaya');
    expect(sql).not.toMatch(/is_active\s*=\s*false/i);
  });

  it('oturumdaki görünen ad ekleyen olarak okunur, boşsa ad uydurulmaz', () => {
    useAuthStore.setState({
      user: { id: 'u1', username: 'aylin', fullName: 'Aylin Kaya', role: 'admin' },
      isAuthenticated: true,
    });
    expect(currentLoginDisplayName()).toBe('Aylin Kaya');
    useAuthStore.setState({ user: null, isAuthenticated: false });
    expect(currentLoginDisplayName()).toBe('');
  });
});

describe('gider kategorisi durum güncelleme', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('Değiştir seçilen Aktif veya Pasif değerini yazar', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    await expenseCategoryAPI.update('user-1', { name: 'KONAKLAMA', is_active: false });
    await expenseCategoryAPI.update('user-1', { name: 'KONAKLAMA', is_active: true });
    const first = String(queryMock.mock.calls[0][0]);
    const second = String(queryMock.mock.calls[1][0]);
    expect(first).toMatch(/is_active = \$2/);
    expect(queryMock.mock.calls[0][1]).toEqual(['KONAKLAMA', false, 'user-1']);
    expect(second).toMatch(/is_active = \$2/);
    expect(queryMock.mock.calls[1][1]).toEqual(['KONAKLAMA', true, 'user-1']);
    expect(first).not.toMatch(/DELETE/i);
    expect(second).not.toMatch(/DELETE/i);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildProfitLossOperatingExpenses,
  profitLossNetProfit,
} from '../../utils/profitLossOperatingExpenses';
import type { Expense } from '../../services/api/expenses';
import type { KasaIslemi } from '../../services/api/kasa';

function expense(partial: Partial<Expense> & Pick<Expense, 'id' | 'amount' | 'category'>): Expense {
  return {
    description: partial.description || 'test',
    payment_method: 'cash',
    store_id: '',
    expense_date: '2026-11-01',
    created_by: '',
    firm_nr: '001',
    ...partial,
  };
}

describe('profitLossOperatingExpenses', () => {
  it('net kâr = brüt kâr − OpEx', () => {
    expect(profitLossNetProfit(1000, 250)).toBe(750);
    expect(profitLossNetProfit(100, 150)).toBe(-50);
  });

  it('kategoriye göre OpEx toplar; kuru bilinen IQD ana paraya çevrilir', () => {
    const expenses: Expense[] = [
      expense({
        id: 'e1',
        category: 'KIRA',
        amount: 1500,
        currency_code: 'USD',
        exchange_rate: 1,
      }),
      expense({
        id: 'e2',
        category: 'MAAS',
        amount: 300_000,
        currency_code: 'IQD',
        exchange_rate: 1 / 1500,
        cash_line_id: 'cl-1',
      }),
    ];
    const cash: KasaIslemi[] = [];
    const summary = buildProfitLossOperatingExpenses({
      expenses,
      cashLines: cash,
      baseCurrency: 'USD',
      translate: (k) => k,
    });
    expect(summary.totalOpEx).toBeCloseTo(1500 + 200, 5);
    expect(summary.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('kur yoksa yabancı tutarı ana para diye eklemez', () => {
    const summary = buildProfitLossOperatingExpenses({
      expenses: [
        expense({
          id: 'e3',
          category: 'DIGER',
          amount: 68_000,
          currency_code: 'IQD',
          exchange_rate: null,
        }),
      ],
      cashLines: [],
      baseCurrency: 'USD',
    });
    expect(summary.totalOpEx).toBe(0);
    expect(summary.rows).toEqual([]);
  });
});

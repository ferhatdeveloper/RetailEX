/**
 * Kâr-Zarar faaliyet giderleri (OpEx).
 * Günlük Rapor birleşik gider motoru ile aynı kaynak — çift sayım yok.
 */

import type { Expense } from '../services/api/expenses';
import type { KasaIslemi } from '../services/api/kasa';
import { resolveExpenseCategoryLabel } from './expenseCategoryLabel';
import {
  mergeExpensesWithCashOuts,
  REPORT_CASH_OUT_TYPES,
} from './reportUnifiedExpenses';
import { baseEquivalentFromStoredLine, normalizeFxCurrency } from './cashFxPosting';
import { parsePositiveAmount } from './cashLineFx';

export type ProfitLossOpExRow = {
  categoryKey: string;
  categoryLabel: string;
  amount: number;
};

export type ProfitLossOpExSummary = {
  rows: ProfitLossOpExRow[];
  totalOpEx: number;
};

function lineAmountInBase(
  expense: Expense,
  baseCurrency: string,
): number {
  const amount = Math.abs(Number(expense.amount) || 0);
  if (!(amount > 0)) return 0;
  const currency = normalizeFxCurrency(expense.currency_code) || normalizeFxCurrency(baseCurrency);
  const base = normalizeFxCurrency(baseCurrency);
  if (!currency || !base || currency === base) return amount;
  const eq = baseEquivalentFromStoredLine({
    amount,
    currency,
    baseCurrency: base,
    exchangeRate: expense.exchange_rate,
  });
  // Kur yoksa (eski satır) ham tutarı ana para diye yazma — 0 (rapor şişmesin)
  return eq != null ? eq : 0;
}

/**
 * Birleşik giderleri kategoriye indirger; tutarlar ana para.
 */
export function buildProfitLossOperatingExpenses(input: {
  expenses: Expense[];
  cashLines: KasaIslemi[];
  baseCurrency: string;
  translate?: (key: string) => string;
}): ProfitLossOpExSummary {
  const unified = mergeExpensesWithCashOuts(
    Array.isArray(input.expenses) ? input.expenses : [],
    Array.isArray(input.cashLines) ? input.cashLines : [],
    {
      allowedCashOutTypes: REPORT_CASH_OUT_TYPES,
      omitOrphanCashMirrors: true,
    },
  );

  const map = new Map<string, { label: string; amount: number }>();
  for (const row of unified) {
    const baseAmt = lineAmountInBase(row, input.baseCurrency);
    if (!(baseAmt > 0)) continue;
    const rawCat = String(row.category || '').trim() || 'OTHER';
    const label = resolveExpenseCategoryLabel(rawCat, {
      translate: input.translate,
    }) || rawCat;
    const key = rawCat.toLocaleUpperCase('tr-TR');
    const prev = map.get(key);
    if (prev) {
      prev.amount += baseAmt;
    } else {
      map.set(key, { label, amount: baseAmt });
    }
  }

  const rows = [...map.entries()]
    .map(([categoryKey, v]) => ({
      categoryKey,
      categoryLabel: v.label,
      amount: Math.round(v.amount * 1e6) / 1e6,
    }))
    .sort((a, b) => b.amount - a.amount || a.categoryLabel.localeCompare(b.categoryLabel, 'tr'));

  const totalOpEx = Math.round(
    rows.reduce((s, r) => s + r.amount, 0) * 1e6,
  ) / 1e6;

  return { rows, totalOpEx };
}

export function profitLossNetProfit(grossProfit: number, totalOpEx: number): number {
  const g = Number(grossProfit) || 0;
  const o = Number(totalOpEx) || 0;
  return Math.round((g - o) * 1e6) / 1e6;
}

/** Test / tip yardımcı — pozitif tutar. */
export function opExPositiveAmount(value: unknown): number {
  return parsePositiveAmount(value);
}

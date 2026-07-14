import { pgQuery } from './pgClient';
import {
  costCentersTable,
  customersTable,
  expensesTable,
  firmNr,
} from './erpTables';

export type PaymentPlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type CostCenterRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type CallPlanRow = {
  id: string;
  customer_name: string;
  customer_code: string | null;
  week_start: string | null;
  call_plan_weekdays: number[];
  call_last_status: string | null;
  call_last_at: string | null;
};

export type ExpenseRow = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string | null;
  payment_method: string | null;
};

async function tryQueries<T>(queries: { sql: string; params?: unknown[] }[]): Promise<T[]> {
  for (const q of queries) {
    try {
      const res = await pgQuery<T>(q.sql, q.params ?? []);
      return res.rows;
    } catch {
      /* next */
    }
  }
  return [];
}

export async function fetchPaymentPlans(limit = 100): Promise<PaymentPlanRow[]> {
  const fn = firmNr();
  return tryQueries<PaymentPlanRow>([
    {
      sql: `SELECT id::text AS id, code, name, description, COALESCE(is_active, true) AS is_active
            FROM logic.pay_plans
            WHERE firm_nr = $1
            ORDER BY code ASC NULLS LAST
            LIMIT $2`,
      params: [fn, limit],
    },
    {
      sql: `SELECT id::text AS id, code, name, description, COALESCE(is_active, true) AS is_active
            FROM public.rex_${fn}_pay_plans
            ORDER BY code ASC NULLS LAST
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchCostCenters(limit = 100): Promise<CostCenterRow[]> {
  const table = costCentersTable();
  return tryQueries<CostCenterRow>([
    {
      sql: `SELECT id::text AS id, code, name, description, COALESCE(is_active, true) AS is_active
            FROM ${table}
            ORDER BY code ASC NULLS LAST
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchCallPlanRows(limit = 100): Promise<CallPlanRow[]> {
  const fn = firmNr();
  const weekly = await tryQueries<CallPlanRow>([
    {
      sql: `SELECT id::text AS id, customer_name, customer_code,
                   week_start::text AS week_start,
                   call_plan_weekdays, call_last_status, call_last_at::text AS call_last_at
            FROM public.customer_call_plan_weekly
            WHERE firm_nr = $1
            ORDER BY week_start DESC NULLS LAST, customer_name ASC
            LIMIT $2`,
      params: [fn, limit],
    },
  ]);
  if (weekly.length) return weekly;

  const cust = customersTable();
  return tryQueries<CallPlanRow>([
    {
      sql: `SELECT id::text AS id, name AS customer_name, code AS customer_code,
                   NULL::text AS week_start,
                   COALESCE(call_plan_weekdays, ARRAY[]::int[]) AS call_plan_weekdays,
                   call_last_status, call_last_at::text AS call_last_at
            FROM ${cust}
            WHERE COALESCE(call_plan_enabled, false) = true
            ORDER BY name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchExpenses(limit = 100): Promise<ExpenseRow[]> {
  const table = expensesTable();
  return tryQueries<ExpenseRow>([
    {
      sql: `SELECT id::text AS id, category, description,
                   COALESCE(amount, 0)::float8 AS amount,
                   expense_date::text AS expense_date, payment_method
            FROM ${table}
            ORDER BY expense_date DESC NULLS LAST, created_at DESC NULLS LAST
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

const TR_WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export function formatCallWeekdays(days: number[]): string {
  if (!days.length) return '—';
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => TR_WEEKDAYS[d] ?? String(d))
    .join(', ');
}

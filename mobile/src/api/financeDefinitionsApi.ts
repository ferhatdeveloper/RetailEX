import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPost } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { createExpenseCashOut, fetchCashRegisters } from './cashApi';
import {
  costCentersTable,
  customersTable,
  expensesTable,
  firmNr,
  newUuid,
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

function isMissingRelationError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return (
    /42P01/i.test(msg) ||
    /does not exist/i.test(msg) ||
    /PGRST205/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  );
}

function mapPaymentPlan(r: Record<string, unknown>): PaymentPlanRow {
  return {
    id: String(r.id ?? ''),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    description: r.description != null ? String(r.description) : null,
    is_active: !(r.is_active === false || String(r.is_active).toLowerCase() === 'false'),
  };
}

/**
 * Web `paymentPlansAPI` ile aynı kaynak: yalnızca `logic.pay_plans`.
 * Tablo yoksa [] (public.rex_*_pay_plans fallback yok — şemada tanımlı değil).
 */
export async function fetchPaymentPlans(limit = 100): Promise<PaymentPlanRow[]> {
  const fn = firmNr();
  return runDataTransport({
    label: 'fetchPaymentPlans',
    viaRest: async () => {
      try {
        const logicRows = await postgrestGet<Record<string, unknown>[]>(
          '/pay_plans',
          {
            select: 'id,code,name,description,is_active',
            firm_nr: `eq.${fn}`,
            order: 'code.asc',
            limit,
          },
          { schema: 'logic' },
        );
        return (Array.isArray(logicRows) ? logicRows : []).map(mapPaymentPlan);
      } catch (e) {
        if (isMissingRelationError(e)) return [];
        throw e;
      }
    },
    viaBridge: async () => {
      try {
        const res = await pgQuery<PaymentPlanRow>(
          `SELECT id::text AS id, code, name, description, COALESCE(is_active, true) AS is_active
           FROM logic.pay_plans
           WHERE firm_nr = $1
           ORDER BY code ASC NULLS LAST
           LIMIT $2`,
          [fn, limit],
        );
        return res.rows ?? [];
      } catch (e) {
        if (isMissingRelationError(e)) return [];
        throw e;
      }
    },
  });
}

export async function fetchCostCenters(limit = 100): Promise<CostCenterRow[]> {
  const table = costCentersTable();
  return runDataTransport({
    label: 'fetchCostCenters',
    viaRest: async () => {
      try {
        const rows = await postgrestGet<Record<string, unknown>[]>(
          `/${table}`,
          { select: 'id,code,name,description,is_active', order: 'code.asc', limit },
          { schema: 'public' },
        );
        return (Array.isArray(rows) ? rows : []).map((r) => ({
          id: String(r.id ?? ''),
          code: String(r.code ?? ''),
          name: String(r.name ?? ''),
          description: r.description != null ? String(r.description) : null,
          is_active: !(r.is_active === false || String(r.is_active).toLowerCase() === 'false'),
        }));
      } catch (e) {
        if (isMissingRelationError(e)) return [];
        throw e;
      }
    },
    viaBridge: () =>
      tryQueries<CostCenterRow>([
        {
          sql: `SELECT id::text AS id, code, name, description, COALESCE(is_active, true) AS is_active
            FROM ${table}
            ORDER BY code ASC NULLS LAST
            LIMIT $1`,
          params: [limit],
        },
      ]),
  });
}

export async function fetchCallPlanRows(limit = 100): Promise<CallPlanRow[]> {
  const fn = firmNr();
  return runDataTransport({
    label: 'fetchCallPlanRows',
    viaRest: async () => {
      try {
        const weekly = await postgrestGet<Record<string, unknown>[]>(
          '/customer_call_plan_weekly',
          {
            select:
              'id,customer_name,customer_code,week_start,call_plan_weekdays,call_last_status,call_last_at',
            firm_nr: `eq.${fn}`,
            order: 'week_start.desc',
            limit,
          },
          { schema: 'public' },
        );
        if (Array.isArray(weekly) && weekly.length) {
          return weekly.map((r) => ({
            id: String(r.id ?? ''),
            customer_name: String(r.customer_name ?? ''),
            customer_code: r.customer_code != null ? String(r.customer_code) : null,
            week_start: r.week_start != null ? String(r.week_start).slice(0, 10) : null,
            call_plan_weekdays: Array.isArray(r.call_plan_weekdays)
              ? (r.call_plan_weekdays as number[])
              : [],
            call_last_status: r.call_last_status != null ? String(r.call_last_status) : null,
            call_last_at: r.call_last_at != null ? String(r.call_last_at) : null,
          }));
        }
      } catch {
        /* customers fallback */
      }
      try {
        const cust = customersTable();
        const rows = await postgrestGet<Record<string, unknown>[]>(
          `/${cust}`,
          {
            select:
              'id,name,code,call_plan_weekdays,call_last_status,call_last_at,call_plan_enabled',
            call_plan_enabled: 'eq.true',
            order: 'name.asc',
            limit,
          },
          { schema: 'public' },
        );
        return (Array.isArray(rows) ? rows : []).map((r) => ({
          id: String(r.id ?? ''),
          customer_name: String(r.name ?? ''),
          customer_code: r.code != null ? String(r.code) : null,
          week_start: null,
          call_plan_weekdays: Array.isArray(r.call_plan_weekdays)
            ? (r.call_plan_weekdays as number[])
            : [],
          call_last_status: r.call_last_status != null ? String(r.call_last_status) : null,
          call_last_at: r.call_last_at != null ? String(r.call_last_at) : null,
        }));
      } catch (e) {
        if (isMissingRelationError(e)) return [];
        throw e;
      }
    },
    viaBridge: async () => {
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
    },
  });
}

export async function fetchExpenses(limit = 100): Promise<ExpenseRow[]> {
  const table = expensesTable();
  return runDataTransport({
    label: 'fetchExpenses',
    viaRest: async () => {
      try {
        const rows = await postgrestGet<Record<string, unknown>[]>(
          `/${table}`,
          {
            select: 'id,category,description,amount,expense_date,payment_method',
            order: 'expense_date.desc',
            limit,
          },
          { schema: 'public' },
        );
        return (Array.isArray(rows) ? rows : []).map((r) => ({
          id: String(r.id ?? ''),
          category: String(r.category ?? ''),
          description: String(r.description ?? ''),
          amount: Number(r.amount ?? 0) || 0,
          expense_date: r.expense_date != null ? String(r.expense_date).slice(0, 10) : null,
          payment_method: r.payment_method != null ? String(r.payment_method) : null,
        }));
      } catch (e) {
        if (isMissingRelationError(e)) return [];
        throw e;
      }
    },
    viaBridge: () =>
      tryQueries<ExpenseRow>([
        {
          sql: `SELECT id::text AS id, category, description,
                   COALESCE(amount, 0)::float8 AS amount,
                   expense_date::text AS expense_date, payment_method
            FROM ${table}
            ORDER BY expense_date DESC NULLS LAST, created_at DESC NULLS LAST
            LIMIT $1`,
          params: [limit],
        },
      ]),
  });
}

/**
 * Gider kaydı. Nakit ödemede kasa satırı web ile aynı: GIDER_PUSULASI, sign −1.
 * Tutar mutlak yazılır. Çoklu döviz kur çevrimi masaüstü kasa çözümleyicisindedir;
 * burada tutar kasa para biriminde girilir.
 */
export async function createExpense(input: {
  category: string;
  description: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
  expenseDate: string;
}): Promise<void> {
  const amount = Math.abs(Number(input.amount) || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Geçersiz gider tutarı');
  const table = expensesTable();
  const fn = firmNr();
  const id = newUuid();
  const day = input.expenseDate.slice(0, 10);
  const category = input.category.trim() || 'Genel';
  const description = input.description.trim() || category;
  const isCash = input.paymentMethod === 'cash';

  let cashLineId: string | null = null;
  let registerId: string | null = null;
  if (isCash) {
    const registers = await fetchCashRegisters(20);
    const kasa =
      registers.find((r) => String(r.code || '').toUpperCase().includes('ANA')) || registers[0];
    if (!kasa?.id) throw new Error('Aktif kasa yok');
    registerId = kasa.id;
    const line = await createExpenseCashOut({
      registerId: kasa.id,
      amount,
      date: day,
      description,
    });
    cashLineId = line.id;
  }

  const body: Record<string, unknown> = {
    id,
    firm_nr: fn,
    category,
    description,
    amount,
    payment_method: input.paymentMethod,
    expense_date: day,
    cash_register_id: registerId,
    cash_line_id: cashLineId,
  };

  await runDataTransport({
    label: 'createExpense',
    viaRest: async () => {
      try {
        await postgrestPost(`/${table}`, body, { schema: 'public', prefer: 'return=minimal' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/cash_line_id|cash_register_id/i.test(msg)) {
          const { cash_line_id: _a, cash_register_id: _b, ...slim } = body;
          await postgrestPost(`/${table}`, slim, { schema: 'public', prefer: 'return=minimal' });
          return;
        }
        throw e;
      }
    },
    viaBridge: async () => {
      try {
        await pgQuery(
          `INSERT INTO ${table}
             (id, firm_nr, category, description, amount, payment_method, expense_date, cash_register_id, cash_line_id)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::date, $8::uuid, $9::uuid)`,
          [id, fn, category, description, amount, input.paymentMethod, day, registerId, cashLineId],
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/cash_line_id|cash_register_id/i.test(msg)) {
          await pgQuery(
            `INSERT INTO ${table}
               (id, firm_nr, category, description, amount, payment_method, expense_date)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::date)`,
            [id, fn, category, description, amount, input.paymentMethod, day],
          );
          return;
        }
        throw e;
      }
    },
  });
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

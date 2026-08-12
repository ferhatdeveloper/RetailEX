import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { supplierAPI, type Supplier } from './suppliers';
import { normalizeFirmTableNr } from './accountBalance';
import {
  addCallPlanWeeks,
  compareWeekStarts,
  getCallPlanWeekEnd,
  getCallPlanWeekStart,
} from '../../utils/customerCallPlanWeek';
import { normalizeCustomerCallWeekdays } from '../../utils/customerCallPlan';

export type CustomerCallPlanWeeklyRow = {
  id: string;
  firm_nr: string;
  week_start: string;
  week_end: string;
  customer_id: string;
  customer_code?: string | null;
  customer_name: string;
  call_plan_weekdays: number[];
  call_plan_note?: string | null;
  call_last_status: string;
  call_last_note?: string | null;
  call_last_at?: string | null;
  archived_at?: string | null;
};

function firmNr(): string {
  return normalizeFirmTableNr(ERP_SETTINGS.firmNr);
}

function customersTable(): string {
  return `rex_${firmNr()}_customers`;
}

function isCallPlanCustomer(row: Supplier): boolean {
  return row.call_plan_enabled === true && normalizeCustomerCallWeekdays(row.call_plan_weekdays).length > 0;
}

function mapWeeklyRow(raw: Record<string, unknown>): CustomerCallPlanWeeklyRow {
  const weekdays = Array.isArray(raw.call_plan_weekdays)
    ? raw.call_plan_weekdays.map(Number).filter(n => Number.isFinite(n))
    : [];
  return {
    id: String(raw.id ?? ''),
    firm_nr: String(raw.firm_nr ?? ''),
    week_start: String(raw.week_start ?? '').slice(0, 10),
    week_end: String(raw.week_end ?? '').slice(0, 10),
    customer_id: String(raw.customer_id ?? ''),
    customer_code: raw.customer_code != null ? String(raw.customer_code) : null,
    customer_name: String(raw.customer_name ?? ''),
    call_plan_weekdays: weekdays,
    call_plan_note: raw.call_plan_note != null ? String(raw.call_plan_note) : null,
    call_last_status: String(raw.call_last_status ?? 'planned'),
    call_last_note: raw.call_last_note != null ? String(raw.call_last_note) : null,
    call_last_at: raw.call_last_at != null ? String(raw.call_last_at) : null,
    archived_at: raw.archived_at != null ? String(raw.archived_at) : null,
  };
}

function customerToWeeklyDraft(customer: Supplier, weekStart: string): Omit<CustomerCallPlanWeeklyRow, 'id' | 'archived_at'> {
  return {
    firm_nr: firmNr(),
    week_start: weekStart,
    week_end: getCallPlanWeekEnd(weekStart),
    customer_id: customer.id,
    customer_code: customer.code || null,
    customer_name: customer.name,
    call_plan_weekdays: normalizeCustomerCallWeekdays(customer.call_plan_weekdays),
    call_plan_note: customer.call_plan_note || null,
    call_last_status: customer.call_last_status || 'planned',
    call_last_note: customer.call_last_note || null,
    call_last_at: customer.call_last_at || null,
  };
}

async function getRolloverWeekStart(): Promise<string | null> {
  const fn = firmNr();
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const rows = await postgrest.get<Record<string, unknown>[]>(
      '/customer_call_plan_rollover',
      { select: 'current_week_start', firm_nr: `eq.${fn}`, limit: '1' },
      { schema: 'public' },
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.current_week_start ? String(row.current_week_start).slice(0, 10) : null;
  }
  const { rows } = await postgres.query(
    `SELECT current_week_start::text AS current_week_start
     FROM public.customer_call_plan_rollover WHERE firm_nr = $1`,
    [fn],
  );
  return rows[0]?.current_week_start ? String(rows[0].current_week_start).slice(0, 10) : null;
}

async function upsertRolloverWeekStart(weekStart: string): Promise<void> {
  const fn = firmNr();
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const existing = await postgrest.get<Record<string, unknown>[]>(
      '/customer_call_plan_rollover',
      { select: 'firm_nr', firm_nr: `eq.${fn}`, limit: '1' },
      { schema: 'public' },
    );
    if (Array.isArray(existing) && existing[0]) {
      await postgrest.patch(
        '/customer_call_plan_rollover',
        { firm_nr: `eq.${fn}` },
        { current_week_start: weekStart, rolled_at: new Date().toISOString() },
        { schema: 'public' },
      );
    } else {
      await postgrest.post(
        '/customer_call_plan_rollover',
        { firm_nr: fn, current_week_start: weekStart, rolled_at: new Date().toISOString() },
        { schema: 'public' },
      );
    }
    return;
  }
  await postgres.query(
    `INSERT INTO public.customer_call_plan_rollover (firm_nr, current_week_start, rolled_at)
     VALUES ($1, $2::date, NOW())
     ON CONFLICT (firm_nr) DO UPDATE SET
       current_week_start = EXCLUDED.current_week_start,
       rolled_at = NOW()`,
    [fn, weekStart],
  );
}

async function archiveWeek(weekStart: string, customers: Supplier[]): Promise<void> {
  const fn = firmNr();
  const active = customers.filter(isCallPlanCustomer);
  if (active.length === 0) return;

  const payloads = active.map(c => customerToWeeklyDraft(c, weekStart));

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    for (const row of payloads) {
      const existing = await postgrest.get<Record<string, unknown>[]>(
        '/customer_call_plan_weekly',
        {
          select: 'id',
          firm_nr: `eq.${fn}`,
          week_start: `eq.${weekStart}`,
          customer_id: `eq.${row.customer_id}`,
          limit: '1',
        },
        { schema: 'public' },
      );
      const body = {
        firm_nr: fn,
        week_start: weekStart,
        week_end: row.week_end,
        customer_id: row.customer_id,
        customer_code: row.customer_code,
        customer_name: row.customer_name,
        call_plan_weekdays: row.call_plan_weekdays,
        call_plan_note: row.call_plan_note,
        call_last_status: row.call_last_status,
        call_last_note: row.call_last_note,
        call_last_at: row.call_last_at,
        archived_at: new Date().toISOString(),
      };
      if (Array.isArray(existing) && existing[0]?.id) {
        await postgrest.patch(
          '/customer_call_plan_weekly',
          { id: `eq.${existing[0].id}` },
          body,
          { schema: 'public' },
        );
      } else {
        await postgrest.post('/customer_call_plan_weekly', body, { schema: 'public' });
      }
    }
    return;
  }

  for (const row of payloads) {
    await postgres.query(
      `INSERT INTO public.customer_call_plan_weekly (
         firm_nr, week_start, week_end, customer_id, customer_code, customer_name,
         call_plan_weekdays, call_plan_note, call_last_status, call_last_note, call_last_at
       ) VALUES ($1, $2::date, $3::date, $4, $5, $6, $7::smallint[], $8, $9, $10, $11)
       ON CONFLICT (firm_nr, week_start, customer_id) DO UPDATE SET
         customer_code = EXCLUDED.customer_code,
         customer_name = EXCLUDED.customer_name,
         call_plan_weekdays = EXCLUDED.call_plan_weekdays,
         call_plan_note = EXCLUDED.call_plan_note,
         call_last_status = EXCLUDED.call_last_status,
         call_last_note = EXCLUDED.call_last_note,
         call_last_at = EXCLUDED.call_last_at,
         archived_at = NOW()`,
      [
        fn,
        weekStart,
        row.week_end,
        row.customer_id,
        row.customer_code,
        row.customer_name,
        row.call_plan_weekdays,
        row.call_plan_note,
        row.call_last_status,
        row.call_last_note,
        row.call_last_at,
      ],
    );
  }
}

async function resetWeeklyCustomerFields(customers: Supplier[]): Promise<void> {
  const table = customersTable();
  const fn = firmNr();
  const ids = customers.filter(isCallPlanCustomer).map(c => c.id);
  if (ids.length === 0) return;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    for (const id of ids) {
      await postgrest.patch(
        `/${table}`,
        { id: `eq.${id}`, firm_nr: `eq.${fn}` },
        { call_last_status: 'planned', call_last_note: null, call_last_at: null },
        { schema: 'public' },
      );
    }
    return;
  }

  await postgres.query(
    `UPDATE ${table}
     SET call_last_status = 'planned', call_last_note = NULL, call_last_at = NULL
     WHERE firm_nr = $1
       AND call_plan_enabled = true
       AND COALESCE(array_length(call_plan_weekdays, 1), 0) > 0`,
    [fn],
  );
}

export const customerCallPlanWeeklyAPI = {
  getCurrentWeekStart(): string {
    return getCallPlanWeekStart();
  },

  /** Hafta değiştiyse arşivle ve haftalık alanları sıfırla. */
  async ensureWeekRollover(): Promise<{ archivedWeeks: number; currentWeekStart: string }> {
    const currentWeekStart = getCallPlanWeekStart();
    let archivedWeeks = 0;

    try {
      const customers = await supplierAPI.getAll({ cardType: 'customer' });
      let storedWeek = await getRolloverWeekStart();

      if (!storedWeek) {
        await upsertRolloverWeekStart(currentWeekStart);
        return { archivedWeeks: 0, currentWeekStart };
      }

      while (compareWeekStarts(storedWeek, currentWeekStart) < 0) {
        await archiveWeek(storedWeek, customers);
        await resetWeeklyCustomerFields(customers);
        archivedWeeks += 1;
        storedWeek = addCallPlanWeeks(storedWeek, 1);
        await upsertRolloverWeekStart(storedWeek);
        for (const c of customers) {
          if (isCallPlanCustomer(c)) {
            c.call_last_status = 'planned';
            c.call_last_note = undefined;
            c.call_last_at = undefined;
          }
        }
      }

      if (compareWeekStarts(storedWeek, currentWeekStart) > 0) {
        await upsertRolloverWeekStart(currentWeekStart);
      }

      return { archivedWeeks, currentWeekStart };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('customer_call_plan_weekly') || msg.includes('42P01')) {
        console.warn('[customerCallPlanWeeklyAPI] rollover skipped — migration 092 gerekli');
        return { archivedWeeks: 0, currentWeekStart };
      }
      throw error;
    }
  },

  async listArchivedWeeks(): Promise<string[]> {
    const fn = firmNr();
    try {
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<Record<string, unknown>[]>(
          '/customer_call_plan_weekly',
          { select: 'week_start', firm_nr: `eq.${fn}`, order: 'week_start.desc' },
          { schema: 'public' },
        );
        const set = new Set<string>();
        for (const row of Array.isArray(rows) ? rows : []) {
          if (row.week_start) set.add(String(row.week_start).slice(0, 10));
        }
        return Array.from(set).sort((a, b) => b.localeCompare(a));
      }
      const { rows } = await postgres.query(
        `SELECT DISTINCT week_start::text AS week_start
         FROM public.customer_call_plan_weekly
         WHERE firm_nr = $1
         ORDER BY week_start DESC`,
        [fn],
      );
      return rows.map((r: { week_start: string }) => String(r.week_start).slice(0, 10));
    } catch {
      return [];
    }
  },

  async getWeeklyReport(weekStart: string): Promise<CustomerCallPlanWeeklyRow[]> {
    const fn = firmNr();
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const rows = await postgrest.get<Record<string, unknown>[]>(
        '/customer_call_plan_weekly',
        {
          select: '*',
          firm_nr: `eq.${fn}`,
          week_start: `eq.${weekStart}`,
          order: 'customer_name.asc',
        },
        { schema: 'public' },
      );
      return (Array.isArray(rows) ? rows : []).map(mapWeeklyRow);
    }
    const { rows } = await postgres.query(
      `SELECT * FROM public.customer_call_plan_weekly
       WHERE firm_nr = $1 AND week_start = $2::date
       ORDER BY customer_name ASC`,
      [fn, weekStart],
    );
    return rows.map(mapWeeklyRow);
  },

  customersToCurrentWeekRows(customers: Supplier[], weekStart: string): CustomerCallPlanWeeklyRow[] {
    return customers
      .filter(isCallPlanCustomer)
      .map(c => ({
        id: `live-${c.id}`,
        archived_at: null,
        ...customerToWeeklyDraft(c, weekStart),
      }))
      .sort((a, b) => a.customer_name.localeCompare(b.customer_name, 'tr'));
  },
};

/**
 * Müşteri Arama Planı — PostgREST öncelikli (web customerCallPlanWeekly + customers).
 */
import { pgQuery } from './pgClient';
import {
  postgrestEq,
  postgrestGet,
  postgrestPatch,
  postgrestPost,
} from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
import { customersTable, firmNr, newUuid } from './erpTables';
import {
  addCallPlanWeeks,
  getCallPlanWeekEnd,
  getCallPlanWeekStart,
  normalizeCustomerCallStatus,
  normalizeCustomerCallWeekdays,
  type CustomerCallStatus,
} from '../utils/customerCallPlan';

export type CallPlanCustomer = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  call_plan_enabled: boolean;
  call_plan_weekdays: number[];
  call_plan_note: string | null;
  call_last_status: CustomerCallStatus;
  call_last_note: string | null;
  call_last_at: string | null;
};

export type CallPlanWeeklyRow = {
  id: string;
  week_start: string;
  week_end: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string;
  call_plan_weekdays: number[];
  call_plan_note: string | null;
  call_last_status: string;
  call_last_note: string | null;
  call_last_at: string | null;
};

const LIVE_SELECT =
  'id,code,name,phone,call_plan_enabled,call_plan_weekdays,call_plan_note,call_last_status,call_last_note,call_last_at';

function mapLive(r: Record<string, unknown>): CallPlanCustomer {
  return {
    id: String(r.id ?? ''),
    code: r.code != null ? String(r.code) : null,
    name: String(r.name ?? ''),
    phone: r.phone != null ? String(r.phone) : null,
    call_plan_enabled: r.call_plan_enabled === true || r.call_plan_enabled === 'true',
    call_plan_weekdays: normalizeCustomerCallWeekdays(r.call_plan_weekdays),
    call_plan_note: r.call_plan_note != null ? String(r.call_plan_note) : null,
    call_last_status: normalizeCustomerCallStatus(r.call_last_status),
    call_last_note: r.call_last_note != null ? String(r.call_last_note) : null,
    call_last_at: r.call_last_at != null ? String(r.call_last_at) : null,
  };
}

function mapWeekly(r: Record<string, unknown>): CallPlanWeeklyRow {
  return {
    id: String(r.id ?? ''),
    week_start: String(r.week_start ?? '').slice(0, 10),
    week_end: String(r.week_end ?? '').slice(0, 10),
    customer_id: String(r.customer_id ?? ''),
    customer_code: r.customer_code != null ? String(r.customer_code) : null,
    customer_name: String(r.customer_name ?? ''),
    call_plan_weekdays: normalizeCustomerCallWeekdays(r.call_plan_weekdays),
    call_plan_note: r.call_plan_note != null ? String(r.call_plan_note) : null,
    call_last_status: String(r.call_last_status ?? 'planned'),
    call_last_note: r.call_last_note != null ? String(r.call_last_note) : null,
    call_last_at: r.call_last_at != null ? String(r.call_last_at) : null,
  };
}

export async function fetchCallPlanCustomers(limit = 500): Promise<CallPlanCustomer[]> {
  const table = customersTable();
  return runDataTransport({
    label: 'fetchCallPlanCustomers',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        `/${table}`,
        {
          select: LIVE_SELECT,
          call_plan_enabled: 'eq.true',
          order: 'name.asc',
          limit,
        },
        { schema: 'public' },
      );
      return (Array.isArray(rows) ? rows : [])
        .map(mapLive)
        .filter((c) => c.id && c.call_plan_enabled && c.call_plan_weekdays.length > 0);
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id::text AS id, code, name, phone,
                COALESCE(call_plan_enabled, false) AS call_plan_enabled,
                COALESCE(call_plan_weekdays, ARRAY[]::int[]) AS call_plan_weekdays,
                call_plan_note, call_last_status, call_last_note,
                call_last_at::text AS call_last_at
         FROM ${table}
         WHERE COALESCE(call_plan_enabled, false) = true
         ORDER BY name ASC
         LIMIT $1`,
        [limit],
      );
      return (res.rows || [])
        .map(mapLive)
        .filter((c) => c.call_plan_weekdays.length > 0);
    },
  });
}

export async function updateCallPlanCustomer(
  id: string,
  patch: {
    call_plan_weekdays?: number[];
    call_plan_note?: string | null;
    call_last_status?: CustomerCallStatus;
    call_last_note?: string | null;
    call_plan_enabled?: boolean;
  },
): Promise<void> {
  const table = customersTable();
  const body: Record<string, unknown> = {};
  if (patch.call_plan_weekdays != null) {
    body.call_plan_weekdays = normalizeCustomerCallWeekdays(patch.call_plan_weekdays);
  }
  if (patch.call_plan_note !== undefined) body.call_plan_note = patch.call_plan_note;
  if (patch.call_last_status != null) {
    body.call_last_status = normalizeCustomerCallStatus(patch.call_last_status);
    body.call_last_at = new Date().toISOString();
  }
  if (patch.call_last_note !== undefined) body.call_last_note = patch.call_last_note;
  if (patch.call_plan_enabled != null) body.call_plan_enabled = patch.call_plan_enabled;

  await runDataTransport({
    label: 'updateCallPlanCustomer',
    viaRest: async () => {
      await postgrestPatch(
        `/${table}?id=eq.${encodeURIComponent(id)}`,
        body,
        { schema: 'public', prefer: 'return=minimal' },
      );
      return true;
    },
    viaBridge: async () => {
      const sets: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (body.call_plan_weekdays != null) {
        sets.push(`call_plan_weekdays = $${i++}`);
        params.push(body.call_plan_weekdays);
      }
      if (body.call_plan_note !== undefined) {
        sets.push(`call_plan_note = $${i++}`);
        params.push(body.call_plan_note);
      }
      if (body.call_last_status != null) {
        sets.push(`call_last_status = $${i++}`);
        params.push(body.call_last_status);
        sets.push(`call_last_at = $${i++}`);
        params.push(body.call_last_at);
      }
      if (body.call_last_note !== undefined) {
        sets.push(`call_last_note = $${i++}`);
        params.push(body.call_last_note);
      }
      if (body.call_plan_enabled != null) {
        sets.push(`call_plan_enabled = $${i++}`);
        params.push(body.call_plan_enabled);
      }
      if (!sets.length) return true;
      params.push(id);
      await pgQuery(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${i}::uuid`,
        params,
      );
      return true;
    },
  });
}

async function getRolloverWeekStart(): Promise<string | null> {
  const fn = firmNr();
  try {
    return await runDataTransport({
      label: 'getRolloverWeekStart',
      viaRest: async () => {
        const rows = await postgrestGet<Record<string, unknown>[]>(
          '/customer_call_plan_rollover',
          { select: 'current_week_start', firm_nr: postgrestEq(fn), limit: 1 },
          { schema: 'public' },
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        return row?.current_week_start ? String(row.current_week_start).slice(0, 10) : null;
      },
      viaBridge: async () => {
        const res = await pgQuery<{ current_week_start: string }>(
          `SELECT current_week_start::text AS current_week_start
           FROM public.customer_call_plan_rollover WHERE firm_nr = $1`,
          [fn],
        );
        return res.rows[0]?.current_week_start
          ? String(res.rows[0].current_week_start).slice(0, 10)
          : null;
      },
    });
  } catch (e) {
    rethrowTransportInfra(e, 'getRolloverWeekStart');
    return null;
  }
}

async function upsertRolloverWeekStart(weekStart: string): Promise<void> {
  const fn = firmNr();
  await runDataTransport({
    label: 'upsertRolloverWeekStart',
    viaRest: async () => {
      const existing = await postgrestGet<Record<string, unknown>[]>(
        '/customer_call_plan_rollover',
        { select: 'firm_nr', firm_nr: postgrestEq(fn), limit: 1 },
        { schema: 'public' },
      );
      if (Array.isArray(existing) && existing[0]) {
        await postgrestPatch(
          `/customer_call_plan_rollover?firm_nr=eq.${encodeURIComponent(fn)}`,
          { current_week_start: weekStart, rolled_at: new Date().toISOString() },
          { schema: 'public', prefer: 'return=minimal' },
        );
      } else {
        await postgrestPost(
          '/customer_call_plan_rollover',
          {
            firm_nr: fn,
            current_week_start: weekStart,
            rolled_at: new Date().toISOString(),
          },
          { schema: 'public', prefer: 'return=minimal' },
        );
      }
      return true;
    },
    viaBridge: async () => {
      await pgQuery(
        `INSERT INTO public.customer_call_plan_rollover (firm_nr, current_week_start, rolled_at)
         VALUES ($1, $2::date, NOW())
         ON CONFLICT (firm_nr) DO UPDATE SET
           current_week_start = EXCLUDED.current_week_start,
           rolled_at = NOW()`,
        [fn, weekStart],
      );
      return true;
    },
  });
}

async function archiveWeek(weekStart: string, customers: CallPlanCustomer[]): Promise<void> {
  const fn = firmNr();
  const weekEnd = getCallPlanWeekEnd(weekStart);
  for (const c of customers) {
    const payload = {
      id: newUuid(),
      firm_nr: fn,
      week_start: weekStart,
      week_end: weekEnd,
      customer_id: c.id,
      customer_code: c.code,
      customer_name: c.name,
      call_plan_weekdays: c.call_plan_weekdays,
      call_plan_note: c.call_plan_note,
      call_last_status: c.call_last_status,
      call_last_note: c.call_last_note,
      call_last_at: c.call_last_at,
      archived_at: new Date().toISOString(),
    };
    try {
      await runDataTransport({
        label: 'archiveCallPlanWeekRow',
        viaRest: async () => {
          const existing = await postgrestGet<Record<string, unknown>[]>(
            '/customer_call_plan_weekly',
            {
              select: 'id',
              firm_nr: postgrestEq(fn),
              week_start: postgrestEq(weekStart),
              customer_id: postgrestEq(c.id),
              limit: 1,
            },
            { schema: 'public' },
          );
          if (Array.isArray(existing) && existing[0]?.id) {
            await postgrestPatch(
              `/customer_call_plan_weekly?id=eq.${encodeURIComponent(String(existing[0].id))}`,
              {
                call_last_status: payload.call_last_status,
                call_last_note: payload.call_last_note,
                call_last_at: payload.call_last_at,
                call_plan_weekdays: payload.call_plan_weekdays,
                call_plan_note: payload.call_plan_note,
                archived_at: payload.archived_at,
              },
              { schema: 'public', prefer: 'return=minimal' },
            );
          } else {
            await postgrestPost('/customer_call_plan_weekly', payload, {
              schema: 'public',
              prefer: 'return=minimal',
            });
          }
          return true;
        },
        viaBridge: async () => {
          await pgQuery(
            `INSERT INTO public.customer_call_plan_weekly (
               id, firm_nr, week_start, week_end, customer_id, customer_code, customer_name,
               call_plan_weekdays, call_plan_note, call_last_status, call_last_note, call_last_at, archived_at
             ) VALUES (
               $1::uuid, $2, $3::date, $4::date, $5::uuid, $6, $7,
               $8::int[], $9, $10, $11, $12::timestamptz, $13::timestamptz
             )
             ON CONFLICT (firm_nr, week_start, customer_id) DO UPDATE SET
               call_last_status = EXCLUDED.call_last_status,
               call_last_note = EXCLUDED.call_last_note,
               call_last_at = EXCLUDED.call_last_at,
               call_plan_weekdays = EXCLUDED.call_plan_weekdays,
               call_plan_note = EXCLUDED.call_plan_note,
               archived_at = EXCLUDED.archived_at`,
            [
              payload.id,
              fn,
              weekStart,
              weekEnd,
              c.id,
              c.code,
              c.name,
              c.call_plan_weekdays,
              c.call_plan_note,
              c.call_last_status,
              c.call_last_note,
              c.call_last_at,
              payload.archived_at,
            ],
          );
          return true;
        },
      });
    } catch (e) {
      rethrowTransportInfra(e, 'archiveWeek');
    }
  }
}

/** Hafta devri: eski haftayı arşivle, durumları sıfırla */
export async function ensureCallPlanWeekRollover(): Promise<{
  currentWeekStart: string;
  archivedWeeks: number;
}> {
  const current = getCallPlanWeekStart();
  let stored: string | null = null;
  try {
    stored = await getRolloverWeekStart();
  } catch (e) {
    rethrowTransportInfra(e, 'ensureCallPlanWeekRollover');
  }

  if (!stored) {
    await upsertRolloverWeekStart(current);
    return { currentWeekStart: current, archivedWeeks: 0 };
  }
  if (stored >= current) {
    return { currentWeekStart: current, archivedWeeks: 0 };
  }

  const customers = await fetchCallPlanCustomers();
  let archived = 0;
  let cursor = stored;
  while (cursor < current) {
    await archiveWeek(cursor, customers);
    archived += 1;
    cursor = addCallPlanWeeks(cursor, 1);
  }

  // Reset live statuses
  for (const c of customers) {
    try {
      await updateCallPlanCustomer(c.id, {
        call_last_status: 'planned',
        call_last_note: null,
      });
    } catch (e) {
      rethrowTransportInfra(e, 'resetCallPlanStatus');
    }
  }

  await upsertRolloverWeekStart(current);
  return { currentWeekStart: current, archivedWeeks: archived };
}

export async function listArchivedCallPlanWeeks(limit = 24): Promise<string[]> {
  const fn = firmNr();
  return runDataTransport({
    label: 'listArchivedCallPlanWeeks',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/customer_call_plan_weekly',
        {
          select: 'week_start',
          firm_nr: postgrestEq(fn),
          order: 'week_start.desc',
          limit: limit * 20,
        },
        { schema: 'public' },
      );
      const set = new Set<string>();
      for (const r of Array.isArray(rows) ? rows : []) {
        const w = String(r.week_start ?? '').slice(0, 10);
        if (w) set.add(w);
      }
      return Array.from(set).sort().reverse().slice(0, limit);
    },
    viaBridge: async () => {
      const res = await pgQuery<{ week_start: string }>(
        `SELECT DISTINCT week_start::text AS week_start
         FROM public.customer_call_plan_weekly
         WHERE firm_nr = $1
         ORDER BY week_start DESC
         LIMIT $2`,
        [fn, limit],
      );
      return (res.rows || []).map((r) => String(r.week_start).slice(0, 10));
    },
  });
}

export async function fetchCallPlanWeeklyReport(
  weekStart: string,
  liveCustomers: CallPlanCustomer[],
): Promise<CallPlanWeeklyRow[]> {
  const current = getCallPlanWeekStart();
  if (weekStart >= current) {
    const end = getCallPlanWeekEnd(weekStart);
    return liveCustomers.map((c) => ({
      id: c.id,
      week_start: weekStart,
      week_end: end,
      customer_id: c.id,
      customer_code: c.code,
      customer_name: c.name,
      call_plan_weekdays: c.call_plan_weekdays,
      call_plan_note: c.call_plan_note,
      call_last_status: c.call_last_status,
      call_last_note: c.call_last_note,
      call_last_at: c.call_last_at,
    }));
  }

  const fn = firmNr();
  return runDataTransport({
    label: 'fetchCallPlanWeeklyReport',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/customer_call_plan_weekly',
        {
          select:
            'id,week_start,week_end,customer_id,customer_code,customer_name,call_plan_weekdays,call_plan_note,call_last_status,call_last_note,call_last_at',
          firm_nr: postgrestEq(fn),
          week_start: postgrestEq(weekStart),
          order: 'customer_name.asc',
          limit: 1000,
        },
        { schema: 'public' },
      );
      return (Array.isArray(rows) ? rows : []).map(mapWeekly);
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id::text AS id, week_start::text AS week_start, week_end::text AS week_end,
                customer_id::text AS customer_id, customer_code, customer_name,
                call_plan_weekdays, call_plan_note, call_last_status, call_last_note,
                call_last_at::text AS call_last_at
         FROM public.customer_call_plan_weekly
         WHERE firm_nr = $1 AND week_start = $2::date
         ORDER BY customer_name ASC`,
        [fn, weekStart],
      );
      return (res.rows || []).map(mapWeekly);
    },
  });
}

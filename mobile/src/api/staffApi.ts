/**
 * Personel — web `staffDbApi` (`public.staff`, `public.staff_attendance`).
 * Bordro sekmesi web’de özet; maaş alanı karttaki `base_salary`.
 */

import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPost } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { firmNr, newUuid, periodNr } from './erpTables';

const PUBLIC = { schema: 'public' as const };

export type StaffRow = {
  id: string;
  full_name: string;
  code: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  base_salary: number;
  is_active: boolean;
};

export type AttendanceRow = {
  id: string;
  staff_name: string | null;
  attendance_date: string;
  status: string | null;
  clock_in: string | null;
  clock_out: string | null;
};

function padFirm(): string {
  const raw = firmNr().replace(/\D/g, '');
  return (raw || '001').padStart(3, '0').slice(0, 4);
}

export async function fetchStaff(search = ''): Promise<StaffRow[]> {
  const fn = padFirm();
  const q = search.trim();
  return runDataTransport({
    label: 'fetchStaff',
    viaRest: async () => {
      const query: Record<string, string | number> = {
        select: 'id,full_name,code,phone,position,department,base_salary,is_active',
        firm_nr: `eq.${fn}`,
        is_active: 'eq.true',
        order: 'full_name.asc',
        limit: 500,
      };
      if (q) query.full_name = `ilike.*${q.replace(/[%*]/g, '')}*`;
      const rows = await postgrestGet<Record<string, unknown>[]>('/staff', query, PUBLIC);
      return (Array.isArray(rows) ? rows : []).map(mapStaff);
    },
    viaBridge: async () => {
      const like = `%${q}%`;
      const res = await pgQuery<Record<string, unknown>>(
        q
          ? `SELECT id::text AS id, full_name, code, phone, position, department,
                    COALESCE(base_salary, 0)::float8 AS base_salary, COALESCE(is_active, true) AS is_active
               FROM public.staff
              WHERE firm_nr = $1 AND COALESCE(is_active, true) = true
                AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(COALESCE(code, '')) LIKE LOWER($2))
              ORDER BY full_name
              LIMIT 500`
          : `SELECT id::text AS id, full_name, code, phone, position, department,
                    COALESCE(base_salary, 0)::float8 AS base_salary, COALESCE(is_active, true) AS is_active
               FROM public.staff
              WHERE firm_nr = $1 AND COALESCE(is_active, true) = true
              ORDER BY full_name
              LIMIT 500`,
        q ? [fn, like] : [fn],
      );
      return res.rows.map(mapStaff);
    },
  });
}

function mapStaff(r: Record<string, unknown>): StaffRow {
  return {
    id: String(r.id ?? ''),
    full_name: String(r.full_name ?? ''),
    code: r.code != null ? String(r.code) : null,
    phone: r.phone != null ? String(r.phone) : null,
    position: r.position != null ? String(r.position) : null,
    department: r.department != null ? String(r.department) : null,
    base_salary: Number(r.base_salary) || 0,
    is_active: r.is_active !== false,
  };
}

export async function createStaff(input: { fullName: string; phone?: string; position?: string; baseSalary?: number }): Promise<void> {
  const fn = padFirm();
  const id = newUuid();
  const salary = Math.abs(Number(input.baseSalary) || 0);
  await runDataTransport({
    label: 'createStaff',
    viaRest: () =>
      postgrestPost(
        '/staff',
        {
          id,
          firm_nr: fn,
          full_name: input.fullName.trim(),
          phone: input.phone?.trim() || null,
          position: input.position?.trim() || null,
          base_salary: salary,
          is_active: true,
          employment_type: 'full_time',
        },
        { ...PUBLIC, prefer: 'return=minimal' },
      ),
    viaBridge: () =>
      pgQuery(
        `INSERT INTO public.staff (id, firm_nr, full_name, phone, position, base_salary, is_active, employment_type)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, true, 'full_time')`,
        [id, fn, input.fullName.trim(), input.phone?.trim() || null, input.position?.trim() || null, salary],
      ),
  });
}

export async function fetchAttendance(dateYmd: string): Promise<AttendanceRow[]> {
  const fn = padFirm();
  const pn = periodNr();
  const day = dateYmd.slice(0, 10);
  return runDataTransport({
    label: 'fetchAttendance',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/staff_attendance',
        {
          select: 'id,staff_name,attendance_date,status,clock_in,clock_out',
          firm_nr: `eq.${fn}`,
          period_nr: `eq.${pn}`,
          attendance_date: `eq.${day}`,
          limit: 500,
        },
        PUBLIC,
      );
      return (Array.isArray(rows) ? rows : []).map(mapAtt);
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id::text AS id, staff_name, attendance_date::text AS attendance_date, status,
                to_char(clock_in, 'HH24:MI') AS clock_in,
                to_char(clock_out, 'HH24:MI') AS clock_out
           FROM public.staff_attendance
          WHERE firm_nr = $1 AND period_nr = $2 AND attendance_date = $3::date
          ORDER BY staff_name
          LIMIT 500`,
        [fn, pn, day],
      );
      return res.rows.map(mapAtt);
    },
  });
}

function mapAtt(r: Record<string, unknown>): AttendanceRow {
  return {
    id: String(r.id ?? ''),
    staff_name: r.staff_name != null ? String(r.staff_name) : null,
    attendance_date: String(r.attendance_date ?? '').slice(0, 10),
    status: r.status != null ? String(r.status) : null,
    clock_in: r.clock_in != null ? String(r.clock_in).slice(0, 5) : null,
    clock_out: r.clock_out != null ? String(r.clock_out).slice(0, 5) : null,
  };
}

/** Web yoklama kaydı — aynı gün varsa üzerine yazılmaz, yeni satır eklenir yalnızca boş günde. */
export async function saveAttendance(input: {
  staffId: string;
  staffName: string;
  date: string;
  status: string;
  clockIn?: string;
  clockOut?: string;
}): Promise<void> {
  const fn = padFirm();
  const pn = periodNr();
  const day = input.date.slice(0, 10);
  await runDataTransport({
    label: 'saveAttendance',
    viaRest: async () => {
      const existing = await postgrestGet<{ id: string }[]>(
        '/staff_attendance',
        {
          select: 'id',
          firm_nr: `eq.${fn}`,
          period_nr: `eq.${pn}`,
          staff_id: `eq.${input.staffId}`,
          attendance_date: `eq.${day}`,
          limit: 1,
        },
        PUBLIC,
      );
      const body = {
        staff_name: input.staffName,
        status: input.status,
        clock_in: input.clockIn || null,
        clock_out: input.clockOut || null,
      };
      if (existing[0]?.id) {
        const { postgrestPatch } = await import('./postgrestClient');
        await postgrestPatch(
          `/staff_attendance?id=eq.${encodeURIComponent(existing[0].id)}`,
          body,
          { ...PUBLIC, prefer: 'return=minimal' },
        );
        return;
      }
      await postgrestPost(
        '/staff_attendance',
        {
          id: newUuid(),
          firm_nr: fn,
          period_nr: pn,
          staff_id: input.staffId,
          attendance_date: day,
          department: null,
          ...body,
        },
        { ...PUBLIC, prefer: 'return=minimal' },
      );
    },
    viaBridge: () =>
      pgQuery(
        `INSERT INTO public.staff_attendance
           (id, firm_nr, period_nr, staff_id, staff_name, attendance_date, status, clock_in, clock_out)
         VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6::date, $7, NULLIF($8, '')::time, NULLIF($9, '')::time)
         ON CONFLICT (firm_nr, period_nr, staff_id, attendance_date)
         DO UPDATE SET status = EXCLUDED.status,
                       clock_in = EXCLUDED.clock_in,
                       clock_out = EXCLUDED.clock_out,
                       staff_name = EXCLUDED.staff_name`,
        [
          newUuid(),
          fn,
          pn,
          input.staffId,
          input.staffName,
          day,
          input.status,
          input.clockIn || '',
          input.clockOut || '',
        ],
      ),
  });
}

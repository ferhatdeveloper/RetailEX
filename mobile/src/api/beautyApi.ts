import { pgQuery } from './pgClient';
import {
  beautyAppointmentsTable,
  beautyServicesTable,
  beautySpecialistsTable,
  customersTable,
  firmNr,
  newUuid,
  periodNr,
} from './erpTables';

export type BeautyAppointment = {
  id: string;
  customer_name: string | null;
  service_name: string | null;
  specialist_name: string | null;
  starts_at: string | null;
  status: string | null;
  total_price: number;
  notes: string | null;
  service_id?: string | null;
  specialist_id?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
};

export type BeautyService = {
  id: string;
  name: string;
  duration_min: number | null;
  price: number;
};

export type BeautySpecialist = {
  id: string;
  name: string;
  title: string | null;
};

export type CreateBeautyAppointmentInput = {
  customerName: string;
  serviceId: string;
  specialistId?: string | null;
  appointmentDate: string;
  appointmentTime: string;
  notes?: string;
};

export type UpdateBeautyAppointmentInput = {
  serviceId?: string | null;
  specialistId?: string | null;
  appointmentDate?: string;
  appointmentTime?: string;
  status?: string;
  notes?: string | null;
  totalPrice?: number;
  clearSpecialist?: boolean;
};

export const BEAUTY_STATUSES = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;

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

function normalizeTimeForPg(t: string): string {
  const s = t.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '10:00:00';
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

export async function fetchBeautyAppointments(limit = 80): Promise<BeautyAppointment[]> {
  const fn = firmNr();
  const pn = periodNr();
  const appt = beautyAppointmentsTable(fn, pn);
  const svc = beautyServicesTable(fn);
  const sp = beautySpecialistsTable(fn);
  const cust = customersTable(fn);

  return tryQueries<BeautyAppointment>([
    {
      sql: `SELECT a.id,
              COALESCE(c.name, NULLIF(TRIM(a.notes), ''), 'Müşteri') AS customer_name,
              s.name AS service_name,
              sp.name AS specialist_name,
              (a.appointment_date::text || ' ' || COALESCE(a.appointment_time::text, '')) AS starts_at,
              a.status,
              COALESCE(a.total_price, 0)::float8 AS total_price,
              a.notes,
              a.service_id::text AS service_id,
              a.specialist_id::text AS specialist_id,
              a.appointment_date::text AS appointment_date,
              COALESCE(to_char(a.appointment_time, 'HH24:MI'), '') AS appointment_time
       FROM ${appt} a
       LEFT JOIN ${cust} c ON c.id = a.client_id
       LEFT JOIN ${svc} s ON s.id = a.service_id
       LEFT JOIN ${sp} sp ON sp.id = a.specialist_id
       ORDER BY a.appointment_date DESC, a.appointment_time DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchBeautyServices(): Promise<BeautyService[]> {
  const svc = beautyServicesTable();
  return tryQueries<BeautyService>([
    {
      sql: `SELECT id, name,
              duration_min,
              COALESCE(price, 0)::float8 AS price
       FROM ${svc}
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC
       LIMIT 100`,
    },
  ]);
}

export async function fetchBeautySpecialists(): Promise<BeautySpecialist[]> {
  const sp = beautySpecialistsTable();
  return tryQueries<BeautySpecialist>([
    {
      sql: `SELECT id, name, specialty AS title
       FROM ${sp}
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC
       LIMIT 100`,
    },
    {
      sql: `SELECT id, name, title
       FROM ${sp}
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC
       LIMIT 100`,
    },
    {
      sql: `SELECT id, name, NULL::text AS title
       FROM ${sp}
       ORDER BY name ASC
       LIMIT 100`,
    },
  ]);
}

export async function createBeautyAppointment(
  input: CreateBeautyAppointmentInput,
): Promise<string> {
  const fn = firmNr();
  const pn = periodNr();
  const appt = beautyAppointmentsTable(fn, pn);
  const svc = beautyServicesTable(fn);
  const id = newUuid();

  const svcRes = await pgQuery<{ price: number; duration_min: number | null }>(
    `SELECT COALESCE(price, 0)::float8 AS price, duration_min FROM ${svc} WHERE id = $1::uuid LIMIT 1`,
    [input.serviceId],
  );
  const svcRow = svcRes.rows[0];
  const price = Number(svcRow?.price) || 0;
  const duration = Math.max(1, Math.round(Number(svcRow?.duration_min) || 30));
  const timePg = normalizeTimeForPg(input.appointmentTime);
  const notes = [input.customerName.trim(), input.notes?.trim()].filter(Boolean).join(' — ');

  await pgQuery(
    `INSERT INTO ${appt} (
       id, service_id, specialist_id,
       appointment_date, appointment_time, duration,
       status, type, notes, total_price, booking_channel
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid,
       $4::date, $5::time, $6,
       'scheduled', 'regular', $7, $8, 'mobile'
     )`,
    [
      id,
      input.serviceId,
      input.specialistId || null,
      input.appointmentDate,
      timePg,
      duration,
      notes || null,
      price,
    ],
  );

  return id;
}

/** Web beautyService.updateAppointment — kısmi güncelleme */
export async function updateBeautyAppointment(
  id: string,
  input: UpdateBeautyAppointmentInput,
): Promise<void> {
  if (!id) throw new Error('Randevu id gerekli');
  const appt = beautyAppointmentsTable();
  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let i = 1;

  if (input.serviceId !== undefined && input.serviceId) {
    sets.push(`service_id = $${i++}::uuid`);
    vals.push(input.serviceId);
    try {
      const svc = beautyServicesTable();
      const svcRes = await pgQuery<{ price: number }>(
        `SELECT COALESCE(price, 0)::float8 AS price FROM ${svc} WHERE id = $1::uuid LIMIT 1`,
        [input.serviceId],
      );
      if (input.totalPrice === undefined && svcRes.rows[0]) {
        sets.push(`total_price = $${i++}`);
        vals.push(Number(svcRes.rows[0].price) || 0);
      }
    } catch {
      /* fiyat güncellenemese devam */
    }
  }
  if (input.clearSpecialist) {
    sets.push('specialist_id = NULL');
  } else if (input.specialistId !== undefined) {
    if (input.specialistId) {
      sets.push(`specialist_id = $${i++}::uuid`);
      vals.push(input.specialistId);
    } else {
      sets.push('specialist_id = NULL');
    }
  }
  if (input.appointmentDate !== undefined) {
    sets.push(`appointment_date = $${i++}::date`);
    vals.push(input.appointmentDate);
  }
  if (input.appointmentTime !== undefined) {
    sets.push(`appointment_time = $${i++}::time`);
    vals.push(normalizeTimeForPg(input.appointmentTime));
  }
  if (input.status !== undefined) {
    sets.push(`status = $${i++}`);
    vals.push(input.status);
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${i++}`);
    vals.push(input.notes?.trim() || null);
  }
  if (input.totalPrice !== undefined) {
    sets.push(`total_price = $${i++}`);
    vals.push(input.totalPrice);
  }

  if (sets.length <= 1) return;
  vals.push(id);
  await pgQuery(`UPDATE ${appt} SET ${sets.join(', ')} WHERE id = $${i}::uuid`, vals);
}

export async function updateBeautyAppointmentStatus(id: string, status: string): Promise<void> {
  await updateBeautyAppointment(id, { status });
}

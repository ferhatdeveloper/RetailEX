import { pgQuery } from './pgClient';
import { firmNr } from './erpTables';

export type BeautyAppointment = {
  id: string;
  customer_name: string | null;
  service_name: string | null;
  specialist_name: string | null;
  starts_at: string | null;
  status: string | null;
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

async function tryQueries<T>(queries: { sql: string; params?: unknown[] }[]): Promise<T[]> {
  for (const q of queries) {
    try {
      const res = await pgQuery<T>(q.sql, q.params ?? []);
      if (res.rows.length >= 0) return res.rows;
    } catch {
      /* next */
    }
  }
  return [];
}

export async function fetchBeautyAppointments(limit = 50): Promise<BeautyAppointment[]> {
  const fn = firmNr();
  return tryQueries<BeautyAppointment>([
    {
      sql: `SELECT id,
              COALESCE(customer_name, client_name) AS customer_name,
              COALESCE(service_name, title) AS service_name,
              specialist_name,
              COALESCE(starts_at, start_time, appointment_at)::text AS starts_at,
              status
       FROM beauty.rex_${fn}_beauty_appointments
       ORDER BY COALESCE(starts_at, start_time, appointment_at) DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
    {
      sql: `SELECT id,
              COALESCE(customer_name, client_name) AS customer_name,
              COALESCE(service_name, title) AS service_name,
              specialist_name,
              COALESCE(starts_at, start_time, appointment_at)::text AS starts_at,
              status
       FROM beauty_appointments
       ORDER BY COALESCE(starts_at, start_time, created_at) DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchBeautyServices(): Promise<BeautyService[]> {
  return tryQueries<BeautyService>([
    {
      sql: `SELECT id, name,
              duration_min,
              COALESCE(price, 0)::float8 AS price
       FROM beauty_services
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC
       LIMIT 100`,
    },
  ]);
}

export async function fetchBeautySpecialists(): Promise<BeautySpecialist[]> {
  return tryQueries<BeautySpecialist>([
    {
      sql: `SELECT id, name, title
       FROM beauty_specialists
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC
       LIMIT 100`,
    },
  ]);
}

import { pgQuery } from './pgClient';
import { firmNr } from './erpTables';

export type SystemUserRow = {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  role_name: string | null;
  firm_nr: string | null;
  is_active: boolean;
  last_login_at: string | null;
};

export type SystemRoleRow = {
  id: string;
  name: string;
  description: string | null;
};

export type AuditLogRow = {
  id: string;
  table_name: string;
  action: string;
  firm_nr: string | null;
  created_at: string | null;
  username: string | null;
};

export type PosDeviceRow = {
  id: string;
  terminal_name: string;
  device_id: string;
  status: string;
  firm_nr: string | null;
  last_seen_at: string | null;
  registered_at: string | null;
};

export type MigrationRow = {
  filename: string;
  applied_at: string | null;
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

export async function fetchSystemUsers(limit = 100): Promise<SystemUserRow[]> {
  const fn = firmNr();
  return tryQueries<SystemUserRow>([
    {
      sql: `SELECT u.id, u.username, u.full_name, u.email,
              COALESCE(r.name, u.role, '') AS role_name,
              u.firm_nr,
              COALESCE(u.is_active, true) AS is_active,
              u.last_login_at::text AS last_login_at
       FROM public.users u
       LEFT JOIN public.roles r ON r.id = u.role_id
       WHERE LPAD(TRIM(COALESCE(u.firm_nr, '')), 3, '0') = $1
          OR TRIM(COALESCE(u.firm_nr, '')) = $2
          OR u.firm_nr IS NULL
       ORDER BY u.username ASC
       LIMIT $3`,
      params: [fn, fn.replace(/^0+/, '') || fn, limit],
    },
    {
      sql: `SELECT u.id, u.username, u.full_name, u.email,
              COALESCE(u.role, '') AS role_name,
              u.firm_nr,
              COALESCE(u.is_active, true) AS is_active,
              NULL::text AS last_login_at
       FROM public.users u
       ORDER BY u.username ASC
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchSystemRoles(limit = 50): Promise<SystemRoleRow[]> {
  return tryQueries<SystemRoleRow>([
    {
      sql: `SELECT id, name, COALESCE(description, '') AS description
       FROM public.roles
       ORDER BY name ASC
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchAuditLogs(limit = 50): Promise<AuditLogRow[]> {
  const fn = firmNr();
  return tryQueries<AuditLogRow>([
    {
      sql: `SELECT a.id, a.table_name, a.action, a.firm_nr,
              a.created_at::text AS created_at,
              u.username
       FROM public.audit_logs a
       LEFT JOIN public.users u ON u.id = a.user_id
       WHERE LPAD(TRIM(COALESCE(a.firm_nr, '')), 3, '0') = $1
          OR TRIM(COALESCE(a.firm_nr, '')) = $2
       ORDER BY a.created_at DESC NULLS LAST
       LIMIT $3`,
      params: [fn, fn.replace(/^0+/, '') || fn, limit],
    },
    {
      sql: `SELECT a.id, a.table_name, a.action, a.firm_nr,
              a.created_at::text AS created_at,
              NULL::text AS username
       FROM public.audit_logs a
       ORDER BY a.created_at DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchPosDevices(limit = 50): Promise<PosDeviceRow[]> {
  const fn = firmNr();
  return tryQueries<PosDeviceRow>([
    {
      sql: `SELECT id, terminal_name, device_id, status, firm_nr,
              last_seen_at::text AS last_seen_at,
              registered_at::text AS registered_at
       FROM public.pos_terminal_registrations
       WHERE LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
          OR TRIM(COALESCE(firm_nr, '')) = $2
       ORDER BY registered_at DESC NULLS LAST
       LIMIT $3`,
      params: [fn, fn.replace(/^0+/, '') || fn, limit],
    },
    {
      sql: `SELECT id, terminal_name, device_id, status, firm_nr,
              last_seen_at::text AS last_seen_at,
              registered_at::text AS registered_at
       FROM public.pos_terminal_registrations
       ORDER BY registered_at DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export type SyncQueueRow = {
  id: string;
  table_name: string;
  action: string;
  status: string;
  terminal_name: string | null;
  error_message: string | null;
  created_at: string | null;
  synced_at: string | null;
};

export type SyncQueueStats = {
  pending: number;
  synced: number;
  failed: number;
};

export async function fetchSyncQueue(limit = 60): Promise<SyncQueueRow[]> {
  const fn = firmNr();
  return tryQueries<SyncQueueRow>([
    {
      sql: `SELECT id::text, table_name, action, COALESCE(status, 'pending') AS status,
              terminal_name, error_message,
              created_at::text AS created_at,
              synced_at::text AS synced_at
       FROM public.sync_queue
       WHERE LPAD(TRIM(COALESCE(firm_nr::text, '')), 3, '0') = $1
          OR TRIM(COALESCE(firm_nr::text, '')) = $2
       ORDER BY created_at DESC NULLS LAST
       LIMIT $3`,
      params: [fn, fn.replace(/^0+/, '') || fn, limit],
    },
    {
      sql: `SELECT id::text, table_name, action, COALESCE(status, 'pending') AS status,
              terminal_name, error_message,
              created_at::text AS created_at,
              synced_at::text AS synced_at
       FROM public.sync_queue
       ORDER BY created_at DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchSyncQueueStats(): Promise<SyncQueueStats> {
  const fn = firmNr();
  const rows = await tryQueries<{ pending: string | number; synced: string | number; failed: string | number }>([
    {
      sql: `SELECT
              COUNT(*) FILTER (WHERE COALESCE(status, 'pending') = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'synced')::int AS synced,
              COUNT(*) FILTER (WHERE status IN ('failed', 'error'))::int AS failed
            FROM public.sync_queue
            WHERE LPAD(TRIM(COALESCE(firm_nr::text, '')), 3, '0') = $1
               OR TRIM(COALESCE(firm_nr::text, '')) = $2`,
      params: [fn, fn.replace(/^0+/, '') || fn],
    },
  ]);
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    synced: Number(row?.synced ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}

/** Yedekleme ekranı için: uygulanan migration özeti (okuma) */
export async function fetchRecentMigrations(limit = 15): Promise<MigrationRow[]> {
  return tryQueries<MigrationRow>([
    {
      sql: `SELECT filename, applied_at::text AS applied_at
       FROM public.schema_migrations
       ORDER BY applied_at DESC NULLS LAST, filename DESC
       LIMIT $1`,
      params: [limit],
    },
    {
      sql: `SELECT migration_name AS filename, applied_at::text AS applied_at
       FROM public.schema_migrations
       ORDER BY applied_at DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

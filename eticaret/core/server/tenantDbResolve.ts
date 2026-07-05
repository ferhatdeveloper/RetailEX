import { Pool } from 'pg';

const poolCache = new Map<string, Pool>();

export function getEticaretPool(connStr: string): Pool {
  let pool = poolCache.get(connStr);
  if (!pool) {
    pool = new Pool({ connectionString: connStr, max: 5 });
    poolCache.set(connStr, pool);
  }
  return pool;
}

function buildConnFromBase(base: string, database: string): string | null {
  const db = database.trim();
  if (!db || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(db)) return null;
  try {
    const conn = base.replace(/\/+$/, '');
    const u = new URL(conn.includes('://') ? conn : `postgres://${conn}`);
    u.pathname = `/${db}`;
    return u.href;
  } catch {
    return null;
  }
}

/** Senkron: connStr veya PG_DUMP_INTERNAL_URI + database adı */
export function resolveEticaretConnStr(body: Record<string, unknown>): string | null {
  const explicit = typeof body.connStr === 'string' ? body.connStr.trim() : '';
  if (explicit) return explicit;
  const base = process.env.PG_DUMP_INTERNAL_URI?.trim();
  if (!base) return null;
  const db =
    (typeof body.database === 'string' && body.database.trim()) ||
    (typeof body.tenant_code === 'string' && body.tenant_code.trim()) ||
    '';
  return buildConnFromBase(base, db);
}

function merkezPgUri(): string | null {
  const direct = process.env.MERKEZ_PG_URI?.trim();
  if (direct) return direct;
  const base = process.env.PG_DUMP_INTERNAL_URI?.trim();
  if (!base) return null;
  return buildConnFromBase(base, 'merkez_db');
}

/** Kiracı kodu → tenant_registry.database_name (yoksa kod) */
export async function resolveTenantDatabaseName(tenantCode: string): Promise<string> {
  const code = tenantCode.trim().toLowerCase();
  if (!code) return '';
  const merkez = merkezPgUri();
  if (!merkez) return code;
  try {
    const pool = getEticaretPool(merkez);
    const row = await pool.query<{ database_name: string | null }>(
      `SELECT database_name FROM public.tenant_registry WHERE code = $1 AND is_active = true LIMIT 1`,
      [code],
    );
    const db = String(row.rows[0]?.database_name || '').trim();
    return db || code;
  } catch {
    return code;
  }
}

export async function resolveEticaretConnStrAsync(
  tenantCode: string,
  databaseHint?: string,
): Promise<string | null> {
  const explicitDb = databaseHint?.trim();
  const db = explicitDb || (tenantCode ? await resolveTenantDatabaseName(tenantCode) : '');
  if (!db) return null;
  return resolveEticaretConnStr({ tenant_code: tenantCode, database: db });
}

export async function loadEticaretSettingsFromPg(
  connStr: string,
): Promise<Record<string, unknown>> {
  const pool = getEticaretPool(connStr);
  const row = await pool.query(`SELECT eticaret_settings FROM public.system_settings WHERE id = 1 LIMIT 1`);
  const settings = row.rows[0]?.eticaret_settings;
  return settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
}

export async function saveEticaretSettingsToPg(
  connStr: string,
  settings: Record<string, unknown>,
): Promise<void> {
  const pool = getEticaretPool(connStr);
  await pool.query(
    `INSERT INTO public.system_settings (id, eticaret_settings, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET
       eticaret_settings = EXCLUDED.eticaret_settings,
       updated_at = now()`,
    [JSON.stringify(settings)],
  );
}

export async function fetchFirmNrFromPg(connStr: string): Promise<string> {
  const pool = getEticaretPool(connStr);
  const row = await pool.query<{ primary_firm_nr: string | null; default_currency: string | null }>(
    `SELECT primary_firm_nr, default_currency FROM public.system_settings WHERE id = 1 LIMIT 1`,
  );
  const firm = String(row.rows[0]?.primary_firm_nr || '001').trim() || '001';
  return firm.padStart(3, '0').slice(0, 10);
}

export function firmNrCandidates(primary: string): string[] {
  const raw = String(primary || '001').trim();
  const padded = raw.padStart(3, '0').slice(0, 10);
  return [...new Set([padded, raw, raw.replace(/^0+/, '') || '0', '001', '1', '01'])].filter(Boolean);
}

export { merkezPgUri };

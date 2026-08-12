/**
 * 1) Kiracı PostgreSQL veritabanlarını yoksa oluşturur (UTF8).
 * 2) merkez_db.tenant_registry — berzin_com, sho_aksesuar, kupeli
 *    Varsayılan: connection_provider=rest_api, rest_base_url=TENANT_REST_API_BASE/code
 *    Doğrudan PG: TENANT_CONNECTION_PROVIDER=db
 *
 * PowerShell:
 *   $env:PGPASSWORD = '...'
 *   $env:PGHOST = '72.60.182.107'
 *   $env:PGDATABASE = 'merkez_db'
 *   npm run db:merkez:tenant-retail-seed
 *
 * Sadece tenant satırı (DB oluşturma yok): $env:SKIP_CREATE_DBS='1'
 *
 * Bakım bağlantısı (CREATE DATABASE için): PG_MAINTENANCE_DATABASE (varsayılan postgres)
 * Şifre: PGPASSWORD veya TENANT_PG_PASS
 *
 * psql ile (PATH yoksa): & 'C:\Program Files\PostgreSQL\16\bin\psql.exe' ...
 */

import pg from 'pg';

const host = process.env.PGHOST || '127.0.0.1';
const port = Number(process.env.PGPORT || 5432);
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || process.env.TENANT_PG_PASS || '';
const merkezDb = process.env.PGDATABASE || 'merkez_db';
const maintenanceDb = process.env.PG_MAINTENANCE_DATABASE || 'postgres';
const skipCreate = String(process.env.SKIP_CREATE_DBS || '').trim() === '1';
const useDbConnection = String(process.env.TENANT_CONNECTION_PROVIDER || '').toLowerCase() === 'db';
const restApiBase = (process.env.TENANT_REST_API_BASE || 'https://api.retailex.app').replace(/\/+$/, '');

if (!password) {
  console.error('Eksik: PGPASSWORD veya TENANT_PG_PASS ortam değişkeni.');
  process.exit(1);
}

const rows = [
  {
    code: 'berzin_com',
    display_name: 'Berzin Company — Mağaza',
    database_name: 'berzin_com',
    notes: 'Perakende; hedef DB: berzin_com',
  },
  {
    code: 'sho_aksesuar',
    display_name: 'Sho Aksesuar — Mağaza',
    database_name: 'sho_aksesuar',
    notes: 'Perakende; hedef DB: sho_aksesuar',
  },
  {
    code: 'kupeli',
    display_name: 'Küpeli — Mağaza',
    database_name: 'kupeli',
    notes: 'Perakende; hedef DB: kupeli',
  },
];

const DB_NAME_RE = /^[a-z][a-z0-9_]*$/;

function assertSafeDbName(name) {
  if (!DB_NAME_RE.test(name)) {
    throw new Error(`Geçersiz veritabanı adı (izin verilen: ${DB_NAME_RE}): ${name}`);
  }
}

function baseClientConfig(overrides) {
  return {
    host,
    port,
    user,
    password,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    ...overrides,
  };
}

/** pg_database üzerinden yoksa CREATE DATABASE (UTF8) */
async function ensureDatabasesExist(dbNames) {
  const admin = new pg.Client(baseClientConfig({ database: maintenanceDb }));
  await admin.connect();
  try {
    await admin.query("SET client_encoding TO 'UTF8'");
    for (const name of dbNames) {
      assertSafeDbName(name);
      const { rows: found } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (found.length > 0) {
        console.log(`DB zaten var: ${name}`);
        continue;
      }
      // Ad allowlist ile doğrulandı; tanımlayıcı olarak güvenli
      await admin.query(`CREATE DATABASE ${name} WITH ENCODING 'UTF8'`);
      console.log(`DB oluşturuldu: ${name}`);
    }
  } finally {
    await admin.end().catch(() => {});
  }
}

const insertSqlRest = `
INSERT INTO tenant_registry (
  code, display_name, module, connection_provider, rest_base_url,
  db_host, db_port, db_user, db_pass, db_sslmode, database_name, notes, is_active
) VALUES
  ($1::text, $2::text, 'retail', $3::text, $4::text, NULL, NULL, NULL, NULL, NULL, $5::text, $6::text, true),
  ($7::text, $8::text, 'retail', $9::text, $10::text, NULL, NULL, NULL, NULL, NULL, $11::text, $12::text, true),
  ($13::text, $14::text, 'retail', $15::text, $16::text, NULL, NULL, NULL, NULL, NULL, $17::text, $18::text, true)
ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  module = EXCLUDED.module,
  connection_provider = EXCLUDED.connection_provider,
  rest_base_url = EXCLUDED.rest_base_url,
  db_host = EXCLUDED.db_host,
  db_port = EXCLUDED.db_port,
  db_user = EXCLUDED.db_user,
  db_pass = EXCLUDED.db_pass,
  db_sslmode = EXCLUDED.db_sslmode,
  database_name = EXCLUDED.database_name,
  notes = EXCLUDED.notes,
  is_active = EXCLUDED.is_active,
  updated_at = now();
`;

const insertSqlDb = `
INSERT INTO tenant_registry (
  code, display_name, module, connection_provider, rest_base_url,
  db_host, db_port, db_user, db_pass, db_sslmode, database_name, notes, is_active
) VALUES
  ($1::text, $2::text, 'retail', 'db', NULL,
   $3::text, $4::int, $5::text, $6::text, $7::text, $8::text, $9::text, true),
  ($10::text, $11::text, 'retail', 'db', NULL,
   $12::text, $13::int, $14::text, $15::text, $16::text, $17::text, $18::text, true),
  ($19::text, $20::text, 'retail', 'db', NULL,
   $21::text, $22::int, $23::text, $24::text, $25::text, $26::text, $27::text, true)
ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  module = EXCLUDED.module,
  connection_provider = EXCLUDED.connection_provider,
  rest_base_url = EXCLUDED.rest_base_url,
  db_host = EXCLUDED.db_host,
  db_port = EXCLUDED.db_port,
  db_user = EXCLUDED.db_user,
  db_pass = EXCLUDED.db_pass,
  db_sslmode = EXCLUDED.db_sslmode,
  database_name = EXCLUDED.database_name,
  notes = EXCLUDED.notes,
  is_active = EXCLUDED.is_active,
  updated_at = now();
`;

const insertSql = useDbConnection ? insertSqlDb : insertSqlRest;

function flatParams() {
  if (useDbConnection) {
    const dbHost = process.env.TENANT_DB_HOST || host;
    const dbPort = Number(process.env.TENANT_DB_PORT || port);
    const dbUser = process.env.TENANT_DB_USER || user;
    const dbSsl = process.env.TENANT_DB_SSLMODE || 'prefer';
    const p = [];
    for (const r of rows) {
      p.push(
        r.code,
        r.display_name,
        dbHost,
        dbPort,
        dbUser,
        password,
        dbSsl,
        r.database_name,
        r.notes
      );
    }
    return p;
  }
  const prov = 'rest_api';
  const p = [];
  for (const r of rows) {
    p.push(r.code, r.display_name, prov, `${restApiBase}/${r.code}`, r.database_name, r.notes);
  }
  return p;
}

const uniqueDbNames = [...new Set(rows.map((r) => r.database_name))];

try {
  if (!skipCreate) {
    console.log(`Bakım DB: ${maintenanceDb} — hedef kiracı DB: ${uniqueDbNames.join(', ')}`);
    await ensureDatabasesExist(uniqueDbNames);
  } else {
    console.log('SKIP_CREATE_DBS=1 — veritabanı oluşturma atlandı.');
  }

  const client = new pg.Client(baseClientConfig({ database: merkezDb }));
  await client.connect();
  try {
    await client.query("SET client_encoding TO 'UTF8'");
    await client.query(insertSql, flatParams());
    const { rows: out } = await client.query(
      `SELECT code, display_name, module, connection_provider, rest_base_url, db_host, db_port, database_name, is_active
       FROM tenant_registry
       WHERE code = ANY($1::text[])
       ORDER BY code`,
      [['berzin_com', 'sho_aksesuar', 'kupeli']]
    );
    console.table(out);
    console.log('Tamam.');
  } finally {
    await client.end().catch(() => {});
  }
} catch (e) {
  console.error(e?.message || String(e));
  process.exit(1);
}

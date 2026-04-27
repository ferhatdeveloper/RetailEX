/**
 * Kiracı PostgreSQL veritabanlarında şema sonrası (opsiyonel):
 * - APP_ADMIN_PASSWORD: public.users kullanıcısı admin şifresini günceller
 * - PG_APP_ROLE_PASSWORD (+ PG_APP_ROLE_NAME): LOGIN rolü oluşturur / şema yetkileri verir
 *
 * mudur / kasiyer uygulama kullanıcıları: tenant-databases-ensure-app-users.mjs
 *
 * Ortam: PGHOST, PGPORT, PGUSER, PGPASSWORD, TENANT_DBS=berzin_com,sho_aksesuar,kupeli
 * Bakım DB (CONNECT GRANT): PG_MAINTENANCE_DATABASE (varsayılan postgres)
 */

import pg from 'pg';

const host = process.env.PGHOST || '127.0.0.1';
const port = Number(process.env.PGPORT || 5432);
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || '';
const maintenanceDb = process.env.PG_MAINTENANCE_DATABASE || 'postgres';
const tenantDbs = (process.env.TENANT_DBS || 'berzin_com,sho_aksesuar,kupeli')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const adminPass = process.env.APP_ADMIN_PASSWORD || '';
const roleName = (process.env.PG_APP_ROLE_NAME || 'retailex_store').trim();
const rolePass = process.env.PG_APP_ROLE_PASSWORD || '';

const IDENT_RE = /^[a-z][a-z0-9_]*$/;

function assertIdent(name, label) {
  if (!IDENT_RE.test(name)) {
    throw new Error(`${label} geçersiz tanımlayıcı: ${name} (beklenen: ${IDENT_RE})`);
  }
}

function clientFor(database) {
  return new pg.Client({
    host,
    port,
    user,
    password,
    database,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
}

async function setAdminPassword(dbName, plain) {
  assertIdent(dbName, 'tenant db');
  const c = clientFor(dbName);
  await c.connect();
  try {
    const r = await c.query(
      `UPDATE public.users
       SET password_hash = crypt($1::text, gen_salt('bf')), updated_at = now()
       WHERE username = 'admin'`,
      [plain]
    );
    console.log(`  ${dbName}: admin şifre güncellendi (satır: ${r.rowCount})`);
  } finally {
    await c.end().catch(() => {});
  }
}

async function ensureRoleAndGrants(dbName, rName, rPass) {
  assertIdent(dbName, 'tenant db');
  assertIdent(rName, 'PG rol adı');

  const maint = clientFor(maintenanceDb);
  await maint.connect();
  try {
    const exists = await maint.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [rName]);
    if (exists.rowCount === 0) {
      await maint.query(`CREATE ROLE ${rName} LOGIN PASSWORD $1`, [rPass]);
      console.log(`  Rol oluşturuldu: ${rName}`);
    } else {
      await maint.query(`ALTER ROLE ${rName} LOGIN PASSWORD $1`, [rPass]);
      console.log(`  Rol vardı, şifre güncellendi: ${rName}`);
    }
    await maint.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${rName}`);
    console.log(`  CONNECT: ${dbName} -> ${rName}`);
  } finally {
    await maint.end().catch(() => {});
  }

  const c = clientFor(dbName);
  await c.connect();
  try {
    const { rows: schemas } = await c.query(`
      SELECT nspname
      FROM pg_namespace
      WHERE nspname NOT IN ('pg_catalog', 'information_schema')
        AND nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      ORDER BY nspname
    `);
    for (const { nspname } of schemas) {
      await c.query(`GRANT USAGE ON SCHEMA ${nspname} TO ${rName}`);
      await c.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${nspname} TO ${rName}`);
      await c.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${nspname} TO ${rName}`);
      await c.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${nspname} TO ${rName}`);
    }
    console.log(`  ${dbName}: ${schemas.length} şema için tablo/dizi/fonksiyon yetkisi -> ${rName}`);
  } finally {
    await c.end().catch(() => {});
  }
}

if (!password) {
  console.error('Eksik: PGPASSWORD');
  process.exit(1);
}

if (!adminPass && !rolePass) {
  console.error('APP_ADMIN_PASSWORD ve/veya PG_APP_ROLE_PASSWORD tanımlayın.');
  process.exit(1);
}

try {
  if (adminPass) {
    console.log('== Uygulama: admin şifresi (public.users) ==');
    for (const db of tenantDbs) {
      await setAdminPassword(db, adminPass);
    }
  }
  if (rolePass) {
    console.log('== PostgreSQL: uygulama rolü + yetkiler ==');
    for (const db of tenantDbs) {
      await ensureRoleAndGrants(db, roleName, rolePass);
    }
    console.log(`Not: tenant_registry / uygulama hâlâ postgres kullanıyorsa bağlantıyı bu role çevirmek için merkez kayıtlarını güncelleyin.`);
  }
  console.log('Post-schema kullanıcı adımları tamam.');
} catch (e) {
  console.error(e?.message || String(e));
  process.exit(1);
}

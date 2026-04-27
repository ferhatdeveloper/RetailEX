/**
 * Kiracı DB'lerinde RetailEX uygulama kullanıcıları (public.users):
 * - mudur  → manager rolü
 * - kasiyer → cashier rolü
 * admin kullanıcısı 000_master_schema.sql ile zaten gelir (varsayılan şifre: admin).
 *
 * Ortam: PGHOST, PGPORT, PGUSER, PGPASSWORD, TENANT_DBS=berzin_com,sho_aksesuar,kupeli
 * TENANT_USER_PASSWORD: mudur + kasiyer giriş şifresi (yoksa geçici varsayılan: admin)
 */

import pg from 'pg';

const host = process.env.PGHOST || '127.0.0.1';
const port = Number(process.env.PGPORT || 5432);
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || '';
const tenantDbs = (process.env.TENANT_DBS || 'berzin_com,sho_aksesuar,kupeli')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const plain = (process.env.TENANT_USER_PASSWORD || 'admin').trim();
const warnDefault = !process.env.TENANT_USER_PASSWORD;

const IDENT_RE = /^[a-z][a-z0-9_]*$/;

function assertIdent(name) {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Geçersiz veritabanı adı: ${name}`);
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

const upsertSql = `
INSERT INTO public.users (
  id, firm_nr, username, password_hash, full_name, email, role, role_id, is_active
) VALUES
  (
    '10000000-0000-4000-a000-000000000010',
    '001',
    'mudur',
    crypt($1::text, gen_salt('bf')),
    'Mağaza Müdürü',
    NULL,
    'manager',
    '00000000-0000-0000-0000-000000000002',
    true
  ),
  (
    '10000000-0000-4000-a000-000000000011',
    '001',
    'kasiyer',
    crypt($1::text, gen_salt('bf')),
    'Kasiyer',
    NULL,
    'cashier',
    '00000000-0000-0000-0000-000000000003',
    true
  )
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  full_name     = EXCLUDED.full_name,
  role          = EXCLUDED.role,
  role_id       = EXCLUDED.role_id,
  firm_nr       = EXCLUDED.firm_nr,
  is_active     = true,
  updated_at    = now();
`;

if (!password) {
  console.error('Eksik: PGPASSWORD');
  process.exit(1);
}

try {
  if (warnDefault) {
    console.warn(
      'UYARI: TENANT_USER_PASSWORD tanımlı değil; mudur/kasiyer için geçici şifre "admin" kullanılıyor. Üretimde mutlaka TENANT_USER_PASSWORD ayarlayın.'
    );
  }
  console.log('== Uygulama kullanıcıları: mudur, kasiyer (firma 001) ==');
  for (const db of tenantDbs) {
    assertIdent(db);
    const c = clientFor(db);
    await c.connect();
    try {
      await c.query("SET client_encoding TO 'UTF8'");
      await c.query(upsertSql, [plain]);
      console.log(
        `  ${db}: mudur + kasiyer güncellendi/eklendi (${warnDefault ? 'varsayılan şifre: admin' : 'TENANT_USER_PASSWORD ile'})`
      );
    } finally {
      await c.end().catch(() => {});
    }
  }
  console.log('Giriş özet: admin / admin (000); mudur + kasiyer / yukarıdaki şifre.');
} catch (e) {
  console.error(e?.message || String(e));
  process.exit(1);
}

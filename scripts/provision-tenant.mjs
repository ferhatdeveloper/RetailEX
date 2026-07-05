#!/usr/bin/env node
/**
 * Merkez SaaS — tek kiracı için PostgreSQL DB + şema + tenant_registry kaydı.
 *
 * Örnek (VPS / Dokploy postgres konteyneri):
 *   POSTGRES_PASSWORD='...' PGHOST=127.0.0.1 \
 *   node scripts/provision-tenant.mjs --code yeni_magaza --display "Yeni Mağaza"
 *
 * Sadece kayıt (DB zaten var):
 *   node scripts/provision-tenant.mjs --code kasap --display Kasap --skip-schema
 *
 * Ortam:
 *   PGPASSWORD / TENANT_PG_PASS (zorunlu)
 *   PGHOST (varsayılan 127.0.0.1), PGPORT, PGUSER
 *   PGDATABASE — merkez katalog DB (varsayılan merkez_db)
 *   API_BASE_URL — rest_base_url öneki (varsayılan https://api.retailex.app)
 *   TENANT_USER_PASSWORD — mudur/kasiyer şifresi (varsayılan admin)
 */

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const VALID_MODULES = new Set(['retail', 'clinic', 'restaurant', 'hrm', 'pdks', 'tenant_registry']);
const CODE_RE = /^[a-z][a-z0-9_]*$/;
const DB_NAME_RE = /^[a-z][a-z0-9_]*$/;

function usage(exitCode = 0) {
  console.log(`
Kullanım:
  node scripts/provision-tenant.mjs --code <kiracı_kodu> --display "<görünen ad>" [seçenekler]

Zorunlu:
  --code          Kiracı kodu (login slug, örn. kasap, yeni_magaza)
  --display       Görünen ad (örn. "Kasaphane")

Seçenekler:
  --db-name       PostgreSQL veritabanı adı (varsayılan: code ile aynı)
  --module        retail | clinic | restaurant | hrm | pdks (varsayılan: retail)
  --api-base      REST kök URL (varsayılan: https://api.retailex.app)
  --skip-create-db   DB oluşturmayı atla
  --skip-schema      Şema / kullanıcı seed atla (yalnızca tenant_registry)
  --dry-run          SQL çalıştırmadan planı yazdır

npm:
  npm run db:provision-tenant -- --code yeni_magaza --display "Yeni Mağaza"
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const out = { dryRun: false, skipCreateDb: false, skipSchema: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage(0);
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a === '--skip-create-db') { out.skipCreateDb = true; continue; }
    if (a === '--skip-schema') { out.skipSchema = true; continue; }
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const val = argv[++i];
    if (val == null || val.startsWith('--')) {
      console.error(`Eksik değer: ${a}`);
      usage(1);
    }
    out[key] = val;
  }
  if (!out.code || !out.display) usage(1);
  out.code = String(out.code).trim().toLowerCase();
  out.display = String(out.display).trim();
  out.dbName = (out.dbName || out.code).trim().toLowerCase();
  out.module = (out.module || 'retail').trim().toLowerCase();
  out.apiBase = (out.apiBase || process.env.API_BASE_URL || 'https://api.retailex.app').replace(/\/+$/, '');
  return out;
}

function readSql(relPath) {
  const full = join(REPO_ROOT, relPath);
  if (!existsSync(full)) throw new Error(`SQL dosyası yok: ${full}`);
  return readFileSync(full, 'utf8');
}

function pgConfig(database) {
  const password = process.env.PGPASSWORD || process.env.TENANT_PG_PASS || '';
  if (!password) {
    console.error('Eksik: PGPASSWORD veya TENANT_PG_PASS');
    process.exit(1);
  }
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password,
    database,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  };
}

async function withClient(database, fn) {
  const client = new pg.Client(pgConfig(database));
  await client.connect();
  try {
    await client.query("SET client_encoding TO 'UTF8'");
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function ensureDatabase(dbName, dryRun) {
  if (!DB_NAME_RE.test(dbName)) throw new Error(`Geçersiz DB adı: ${dbName}`);
  const maintenance = process.env.PG_MAINTENANCE_DATABASE || 'postgres';
  if (dryRun) {
    console.log(`[dry-run] CREATE DATABASE ${dbName} (yoksa)`);
    return;
  }
  await withClient(maintenance, async (client) => {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length > 0) {
      console.log(`DB zaten var: ${dbName}`);
      return;
    }
    await client.query(`CREATE DATABASE ${dbName} WITH ENCODING 'UTF8'`);
    console.log(`DB oluşturuldu: ${dbName}`);
  });
}

async function applySqlFile(client, label, sql) {
  console.log(`  SQL: ${label}`);
  await client.query(sql);
}

async function provisionSchema(dbName, displayName, tenantPassword, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] ${dbName}: master şema + PostgREST + firma/kullanıcı seed`);
    return;
  }

  const master = readSql('database/migrations/000_master_schema.sql');
  const roleSql = readSql('database/migrations/007_postgrest_anon_role.sql');
  const rpcSql = readSql('database/migrations/008_postgrest_verify_login_rpc.sql');
  const messagingPath = 'database/migrations/044_messaging_postgrest_sync.sql';
  const messagingSql = existsSync(join(REPO_ROOT, messagingPath)) ? readSql(messagingPath) : null;

  await withClient(dbName, async (client) => {
    const { rows } = await client.query(
      "SELECT to_regclass('public.firms') IS NOT NULL AS f, to_regclass('public.rex_001_items') IS NOT NULL AS r"
    );
    const hasFirms = rows[0]?.f === true;
    const hasRex = rows[0]?.r === true;
    if (!hasFirms || !hasRex) {
      await applySqlFile(client, '000_master_schema.sql', master);
    } else {
      console.log(`  Şema mevcut (${dbName}), master atlandı`);
    }
    await applySqlFile(client, '007_postgrest_anon_role.sql', roleSql);
    await applySqlFile(client, '008_postgrest_verify_login_rpc.sql', rpcSql);
    if (messagingSql) {
      try {
        await applySqlFile(client, '044_messaging_postgrest_sync.sql', messagingSql);
        await client.query(
          "INSERT INTO public.schema_migrations (filename) VALUES ('044_messaging_postgrest_sync.sql') ON CONFLICT (filename) DO NOTHING"
        );
      } catch (e) {
        console.warn('  messaging migration atlandı:', e instanceof Error ? e.message : e);
      }
    }

    await client.query(
      `UPDATE public.firms SET name = $1, is_active = true, "default" = true WHERE firm_nr = '001'`,
      [displayName]
    );
    await client.query(
      `INSERT INTO public.firms (
        id, firm_nr, name, ana_para_birimi, raporlama_para_birimi,
        regulatory_region, gib_integration_mode, gib_ubl_profile, "default", is_active
      )
      SELECT $2, '001', $1, 'TRY', 'TRY', 'TR', 'mock', 'TICARIFATURA', true, true
      WHERE NOT EXISTS (SELECT 1 FROM public.firms WHERE firm_nr = '001')`,
      [displayName, '00000000-0000-4000-a000-000000000001']
    );
    await client.query(
      `INSERT INTO public.periods (id, firm_id, nr, beg_date, end_date, is_active)
      SELECT $1, '00000000-0000-4000-a000-000000000001', 1, DATE '2026-01-01', DATE '2026-12-31', true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.periods WHERE firm_id = '00000000-0000-4000-a000-000000000001' AND nr = 1
      )`,
      ['4a23375d-c180-4459-9043-49f3f131bd58']
    );
    await client.query(
      `INSERT INTO public.users (id, firm_nr, username, password_hash, full_name, email, role, role_id, is_active)
      VALUES
        ($1, '001', 'mudur', crypt($2, gen_salt('bf')), 'Mağaza Müdürü', NULL, 'manager', '00000000-0000-0000-0000-000000000002', true),
        ($3, '001', 'kasiyer', crypt($2, gen_salt('bf')), 'Kasiyer', NULL, 'cashier', '00000000-0000-0000-0000-000000000003', true)
      ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash, is_active = true, updated_at = now()`,
      [
        '10000000-0000-4000-a000-000000000010',
        tenantPassword,
        '10000000-0000-4000-a000-000000000011',
      ]
    );
    await client.query(`NOTIFY pgrst, 'reload schema'`);
    console.log(`  Şema ve kullanıcılar hazır: ${dbName}`);
  });
}

async function upsertTenantRegistry({ code, display, module, dbName, apiBase, dryRun }) {
  const merkezDb = process.env.PGDATABASE || 'merkez_db';
  const restUrl = `${apiBase}/${code}`;
  if (dryRun) {
    console.log(`[dry-run] tenant_registry: code=${code} db=${dbName} rest=${restUrl}`);
    return;
  }

  await withClient(merkezDb, async (client) => {
    const alterPaths = [
      'database/scripts/merkez_tenant_registry_add_connection_fields.sql',
      'database/scripts/merkez_tenant_registry_add_logo_rest_fields.sql',
    ];
    for (const p of alterPaths) {
      const full = join(REPO_ROOT, p);
      if (existsSync(full)) {
        await client.query(readFileSync(full, 'utf8'));
      }
    }

    await client.query(
      `INSERT INTO tenant_registry (
        code, display_name, module, connection_provider, rest_base_url,
        database_name, is_active, notes
      ) VALUES ($1, $2, $3, 'rest_api', $4, $5, true, $6)
      ON CONFLICT (code) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        module = EXCLUDED.module,
        connection_provider = EXCLUDED.connection_provider,
        rest_base_url = EXCLUDED.rest_base_url,
        database_name = EXCLUDED.database_name,
        is_active = EXCLUDED.is_active,
        notes = EXCLUDED.notes,
        updated_at = now()`,
      [
        code,
        display,
        module,
        restUrl,
        dbName,
        `provision-tenant.mjs ile oluşturuldu; DB=${dbName}`,
      ]
    );
    console.log(`tenant_registry güncellendi: ${code} → ${restUrl}`);
  });
}

function printInfraChecklist(code, dbName) {
  const service = `postgrest_${code}`;
  console.log(`
── Sonraki adımlar (altyapı — henüz otomatik değil) ──
1) docker-compose.dokploy.yml içine PostgREST servisi ekleyin:
   - servis adı: ${service}
   - PGRST_DB_URI: postgres://postgres:***@postgres:5432/${dbName}
   - yeni host portu (ör. 3019)

2) database/docker/Caddyfile.api-gateway:
   handle_path /${code}/* → reverse_proxy ${service}:3000

3) Dokploy redeploy:
   docker compose -f docker-compose.dokploy.yml up -d --build ${service} retailex_api_gateway

4) Bekleyen migration:
   npm run db:migrate:tenants

5) Giriş testi: retailex.app → kiracı kodu "${code}" → admin / mudur
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!CODE_RE.test(args.code)) {
    console.error(`Geçersiz --code (küçük harf, rakam, _): ${args.code}`);
    process.exit(1);
  }
  if (!DB_NAME_RE.test(args.dbName)) {
    console.error(`Geçersiz --db-name: ${args.dbName}`);
    process.exit(1);
  }
  if (!VALID_MODULES.has(args.module)) {
    console.error(`Geçersiz --module: ${args.module}`);
    process.exit(1);
  }

  const tenantPassword = process.env.TENANT_USER_PASSWORD || 'admin';

  console.log(`Kiracı: ${args.code} (${args.display})`);
  console.log(`DB: ${args.dbName} | modül: ${args.module} | API: ${args.apiBase}/${args.code}`);

  if (!args.skipCreateDb) {
    console.log('\n== 1) Veritabanı ==');
    await ensureDatabase(args.dbName, args.dryRun);
  }

  if (!args.skipSchema) {
    console.log('\n== 2) Şema + kullanıcılar ==');
    await provisionSchema(args.dbName, args.display, tenantPassword, args.dryRun);
  }

  console.log('\n== 3) merkez_db tenant_registry ==');
  await upsertTenantRegistry(args);

  if (!args.dryRun) {
    printInfraChecklist(args.code, args.dbName);
    console.log('Tamamlandı.');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

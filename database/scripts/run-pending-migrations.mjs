#!/usr/bin/env node
/**
 * config.db (SQLite) içinden PG bağlantı bilgisini okur, henüz uygulanmamış
 * numaralı migration dosyalarını (002+, 000/001 hariç) PostgreSQL'de çalıştırır.
 *
 * Ortam değişkenleri:
 *   CONFIG_DB      — SQLite yolu (varsayılan: C:\\RetailEX\\config.db, C:\\RetailEx\\config.db, ./config.db)
 *   MIGRATE_TARGET — local | remote | auto (auto: db_mode online→remote, diğer→local)
 *   PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT — CONFIG_DB yoksa veya --env-only
 *
 * Kullanım: npm run db:migrate
 *           node database/scripts/run-pending-migrations.mjs --dry-run
 *           node database/scripts/run-pending-migrations.mjs --env-only
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

function decodeConfigPass(s) {
  if (!s || typeof s !== 'string') return '';
  try {
    const b = Buffer.from(s, 'base64');
    if (b.length && /^[A-Za-z0-9+/=]+$/.test(s.replace(/\s/g, ''))) {
      const t = b.toString('utf8');
      if (t.length > 0 && !t.includes('\0')) return t;
    }
  } catch (_) {}
  return s;
}

function parseLocalDb(localDb) {
  const out = { host: '127.0.0.1', port: 5432, database: 'retailex_local' };
  if (!localDb || typeof localDb !== 'string') return out;
  const host = localDb.split(':')[0] || '127.0.0.1';
  out.host = host;
  if (localDb.includes(':')) {
    const after = localDb.split(':')[1] || '';
    const portPart = after.split('/')[0];
    if (portPart) out.port = parseInt(portPart, 10) || 5432;
    if (localDb.includes('/')) {
      const dbPart = localDb.split('/').slice(1).join('/');
      if (dbPart) out.database = dbPart;
    }
  }
  return out;
}

function parseRemoteDb(remoteDb) {
  const out = { host: '127.0.0.1', port: 5432, database: 'retailex_local' };
  if (!remoteDb || typeof remoteDb !== 'string') return out;
  out.host = remoteDb.split(':')[0] || '127.0.0.1';
  return out;
}

function resolveConfigDbPath() {
  const env = process.env.CONFIG_DB;
  if (env && existsSync(env)) return env;
  const candidates = [
    'C:\\RetailEX\\config.db',
    'C:\\RetailEx\\config.db',
    join(process.cwd(), 'config.db'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function loadPgFromConfigDb(configPath) {
  let Database;
  try {
    const mod = await import('better-sqlite3');
    Database = mod.default;
  } catch (e) {
    console.error('[db:migrate] better-sqlite3 yüklenemedi. Çalıştırın: npm i -D better-sqlite3');
    console.error(e.message || e);
    process.exit(1);
  }
  const db = new Database(configPath, { readonly: true });
  const row = db.prepare('SELECT data FROM config WHERE id = 1').get();
  db.close();
  if (!row?.data) {
    console.error('[db:migrate] config.db içinde config satırı yok.');
    process.exit(1);
  }
  const config = JSON.parse(row.data);
  config.pg_local_pass = decodeConfigPass(config.pg_local_pass);
  config.pg_remote_pass = decodeConfigPass(config.pg_remote_pass);

  const target =
    process.env.MIGRATE_TARGET ||
    (config.db_mode === 'online' ? 'remote' : 'local');

  if (target === 'remote') {
    const r = parseRemoteDb(config.remote_db);
    return {
      host: r.host,
      port: r.port,
      database: process.env.PGDATABASE || r.database,
      user: config.pg_remote_user || 'postgres',
      password: config.pg_remote_pass || '',
    };
  }
  const l = parseLocalDb(config.local_db);
  return {
    host: l.host,
    port: l.port,
    database: l.database,
    user: config.pg_local_user || 'postgres',
    password: config.pg_local_pass || '',
  };
}

function loadPgFromEnv() {
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'retailex_local',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
  };
}

const SETUP_EXTRA = 'SETUP_RESTAURANT_CHAT_ADDITIONS.sql';

function listPendingMigrations(appliedSet) {
  const numbered = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/i.test(f))
    .filter((f) => !f.startsWith('000_') && !f.startsWith('001_'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const pendingNumbered = numbered.filter((f) => !appliedSet.has(f));
  const setupPath = join(MIGRATIONS_DIR, SETUP_EXTRA);
  const setupPending =
    existsSync(setupPath) && !appliedSet.has(SETUP_EXTRA)
      ? [SETUP_EXTRA]
      : [];
  return [...pendingNumbered, ...setupPending];
}

function buildPsqlArgs(pg, sqlFile) {
  const { host, port, database, user, password } = pg;
  const uri = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
  return ['-v', 'ON_ERROR_STOP=1', '-f', sqlFile, uri];
}

function findPsql() {
  const tryPaths = ['psql', 'psql.exe'];
  for (const p of tryPaths) {
    const r = spawnSync(p, ['--version'], { encoding: 'utf8', shell: true });
    if (r.status === 0) return p;
  }
  const win = process.platform === 'win32';
  if (win) {
    for (const ver of ['16', '15', '14', '13']) {
      const exe = `C:\\Program Files\\PostgreSQL\\${ver}\\bin\\psql.exe`;
      if (existsSync(exe)) return exe;
    }
  }
  return null;
}

async function ensureMigrationsTable(pg) {
  const { Client } = await import('pg');
  const client = new Client({
    host: pg.host,
    port: pg.port,
    database: pg.database,
    user: pg.user,
    password: pg.password,
  });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await client.end();
}

async function getAppliedMigrations(pg) {
  const { Client } = await import('pg');
  const client = new Client({
    host: pg.host,
    port: pg.port,
    database: pg.database,
    user: pg.user,
    password: pg.password,
  });
  await client.connect();
  const { rows } = await client.query(
    'SELECT filename FROM public.schema_migrations ORDER BY filename'
  );
  await client.end();
  return new Set(rows.map((r) => r.filename));
}

async function recordMigration(pg, filename) {
  const { Client } = await import('pg');
  const client = new Client({
    host: pg.host,
    port: pg.port,
    database: pg.database,
    user: pg.user,
    password: pg.password,
  });
  await client.connect();
  await client.query(
    'INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
    [filename]
  );
  await client.end();
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--[^\n]*/gm, '').trim())
    .filter((s) => s.length > 0);
}

async function runSqlWithPgClient(pg, filePath) {
  const { Client } = await import('pg');
  const sql = readFileSync(filePath, 'utf8');
  const client = new Client({
    host: pg.host,
    port: pg.port,
    database: pg.database,
    user: pg.user,
    password: pg.password,
  });
  await client.connect();
  try {
    const parts = splitSqlStatements(sql);
    if (parts.length <= 1) {
      await client.query(parts[0] ? parts[0] + ';' : sql);
    } else {
      for (const st of parts) {
        await client.query(st + ';');
      }
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const envOnly = process.argv.includes('--env-only');

  let pg;
  if (envOnly) {
    pg = loadPgFromEnv();
    console.log('[db:migrate] Bağlantı: PG* ortam değişkenleri');
  } else {
    const configPath = resolveConfigDbPath();
    if (!configPath) {
      console.error(
        '[db:migrate] config.db bulunamadı. CONFIG_DB ayarlayın veya --env-only kullanın (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).'
      );
      process.exit(1);
    }
    console.log('[db:migrate] config.db:', configPath);
    pg = await loadPgFromConfigDb(configPath);
  }

  console.log(
    `[db:migrate] Hedef: ${pg.user}@${pg.host}:${pg.port}/${pg.database}`
  );

  await ensureMigrationsTable(pg);
  const applied = await getAppliedMigrations(pg);
  const pending = listPendingMigrations(applied);

  if (pending.length === 0) {
    console.log('[db:migrate] Uygulanacak yeni migration yok.');
    return;
  }

  console.log('[db:migrate] Bekleyen dosyalar:', pending.join(', '));
  if (dryRun) {
    console.log('[db:migrate] --dry-run: çalıştırılmadı.');
    return;
  }

  const psql = findPsql();
  for (const file of pending) {
    const fullPath = join(MIGRATIONS_DIR, file);
    console.log('[db:migrate] Çalıştırılıyor:', file);
    let ok = false;
    if (psql) {
      const args = buildPsqlArgs(pg, fullPath);
      const r = spawnSync(psql, args, {
        stdio: 'inherit',
        shell: false,
        env: { ...process.env, PGPASSWORD: pg.password },
      });
      ok = r.status === 0;
    }
    if (!ok && !psql) {
      console.log('[db:migrate] psql bulunamadı, node-pg ile deneniyor (basit SQL için)...');
      try {
        await runSqlWithPgClient(pg, fullPath);
        ok = true;
      } catch (e) {
        console.error('[db:migrate] Hata:', e.message);
        console.error(
          'PostgreSQL istemcisini PATH\'e ekleyin veya psql ile tekrar deneyin.'
        );
        process.exit(1);
      }
    } else if (!ok) {
      process.exit(1);
    }
    await recordMigration(pg, file);
    console.log('[db:migrate] Tamamlandı:', file);
  }
  console.log('[db:migrate] Bitti.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

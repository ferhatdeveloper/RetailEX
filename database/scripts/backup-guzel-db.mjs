#!/usr/bin/env node
/**
 * guzel DB Yedekleme
 *
 * Tam SQL dump alır (schema + veri).
 *
 * Kullanım:
 *   PGPASSWORD='...' node database/scripts/backup-guzel-db.mjs
 *   PGPASSWORD='...' node database/scripts/backup-guzel-db.mjs --out /path/to/file.sql
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

const HOST = process.env.PGHOST || '72.60.182.107';
const PORT = parseInt(process.env.PGPORT || '5432', 10);
const USER = process.env.PGUSER || 'postgres';
const PASSWORD = process.env.PGPASSWORD || '';
const DB = process.env.PGDATABASE || 'guzel';

const argv = process.argv.slice(2);
const argMap = (key) => {
  const idx = argv.indexOf(key);
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : null;
};
const OUT_OVERRIDE = argMap('--out');

if (!PASSWORD) {
  console.error('PGPASSWORD gerekli (env).');
  process.exit(2);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const DEFAULT_OUT = `database/backups/guzel-${ts}.sql`;
const OUT = resolve(OUT_OVERRIDE || DEFAULT_OUT);
const outDir = dirname(OUT);
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

console.log(`[Yedek] DB: ${DB} @ ${HOST}:${PORT}`);
console.log(`[Yedek] Çıktı: ${OUT}`);

const args = [
  '-h', HOST,
  '-p', String(PORT),
  '-U', USER,
  '-d', DB,
  '--no-owner',
  '--no-privileges',
  '--file=' + OUT,
  '--format=plain',
  '--inserts',
  '--column-inserts',
];

const proc = spawn('pg_dump', args, {
  env: { ...process.env, PGPASSWORD: PASSWORD },
  stdio: 'inherit',
});

proc.on('exit', (code) => {
  if (code === 0) {
    console.log(`[Yedek] ✅ Başarılı: ${OUT}`);
  } else {
    console.error(`[Yedek] ❌ pg_dump exit code: ${code}`);
  }
  process.exit(code || 0);
});

proc.on('error', (e) => {
  console.error('[Yedek] FATAL:', e.message);
  process.exit(1);
});

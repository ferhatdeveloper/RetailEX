#!/usr/bin/env node
/**
 * Uzak PostgreSQL üzerinde bekleyen migration'ları çalıştırır.
 * Kaynak: config/remote-pg.defaults.json (CONFIG_DB yoksa veya MIGRATE_TARGET=remote ile).
 *
 * Kullanım: npm run db:migrate:remote
 */

import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const d = loadRemotePgDefaults();

const env = {
  ...process.env,
  MIGRATE_TARGET: 'remote',
  PGHOST: process.env.PGHOST || d.host,
  PGPORT: String(process.env.PGPORT || d.port),
  PGDATABASE: process.env.PGDATABASE || d.database,
  PGUSER: process.env.PGUSER || d.user,
  PGPASSWORD: process.env.PGPASSWORD || d.password,
};

console.log(
  `[db:migrate:remote] Hedef: ${env.PGUSER}@${env.PGHOST}:${env.PGPORT}/${env.PGDATABASE}`,
);

const script = join(__dirname, '..', 'database', 'scripts', 'run-pending-migrations.mjs');
const extraArgs = process.argv.slice(2);
const result = spawnSync(process.execPath, [script, '--env-only', ...extraArgs], {
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 1);

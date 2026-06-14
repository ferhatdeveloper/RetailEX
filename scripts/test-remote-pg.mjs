#!/usr/bin/env node
/**
 * Uzak PostgreSQL bağlantı testi — config/remote-pg.defaults.json kullanır.
 * Kullanım: npm run db:test:remote
 */

import { loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';

async function main() {
  const d = loadRemotePgDefaults();
  const target = `${d.host}:${d.port}/${d.database}`;
  console.log(`[db:test:remote] Bağlanılıyor: ${d.user}@${target}`);

  const { Client } = await import('pg');
  const client = new Client({
    host: d.host,
    port: d.port,
    database: d.database,
    user: d.user,
    password: d.password,
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    const ver = await client.query('SELECT version() AS v');
    const mig = await client.query(
      `SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 5`,
    ).catch(() => ({ rows: [] }));
    console.log('[db:test:remote] Bağlantı başarılı.');
    console.log('[db:test:remote] PG:', String(ver.rows[0]?.v || '').slice(0, 80));
    if (mig.rows.length) {
      console.log('[db:test:remote] Son migrationlar:', mig.rows.map((r) => r.filename).join(', '));
    } else {
      console.log('[db:test:remote] schema_migrations boş veya tablo yok.');
    }
  } catch (err) {
    console.error('[db:test:remote] Bağlantı başarısız:', err?.message || err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();

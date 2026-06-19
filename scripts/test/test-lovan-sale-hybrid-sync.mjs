#!/usr/bin/env node
/**
 * Lovan hibrit: yerel satış → sync_queue → merkez PostgREST
 * Kullanım: node scripts/test/test-lovan-sale-hybrid-sync.mjs
 */

import pg from 'pg';

const LOVAN_REST = 'https://api.retailex.app/lovan';
const LOCAL = {
  host: '127.0.0.1',
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
};

const saleId = crypto.randomUUID();
const ficheNo = `SALE-HYBRID-${Date.now()}`;

async function restGet(path) {
  const res = await fetch(`${LOVAN_REST}${path}`, {
    headers: { Accept: 'application/json', 'Accept-Profile': 'public' },
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

async function syncPendingSale(client) {
  const rows = await client.query(
    `SELECT id::text, table_name, record_id::text, action, data
     FROM sync_queue
     WHERE status = 'pending' AND retry_count < 10 AND record_id = $1::uuid`,
    [saleId],
  );
  if (rows.rows.length === 0) return { synced: 0, errors: ['pending kayıt yok'] };

  let synced = 0;
  const errors = [];
  for (const row of rows.rows) {
    try {
      const res = await fetch(`${LOVAN_REST}/${row.table_name}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Profile': 'public',
          'Content-Profile': 'public',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(row.data),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`${res.status} ${t.slice(0, 200)}`);
      }
      await client.query(
        `UPDATE sync_queue SET status='completed', synced_at=NOW(), error_message=NULL WHERE id=$1::uuid`,
        [row.id],
      );
      synced += 1;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { synced, errors };
}

async function main() {
  console.log('\n=== Lovan satış hibrit senkron testi ===');
  console.log('Fiş:', ficheNo);

  const client = new pg.Client(LOCAL);
  await client.connect();

  try {
    const before = await restGet(`/rex_001_01_sales?fiche_no=eq.${encodeURIComponent(ficheNo)}&select=fiche_no,total_gross`);
    if (before.body?.length) throw new Error('Merkezde fiş zaten var');

    console.log('\n▶ 1) OFFLINE — yerel satış kaydı');
    await client.query(
      `INSERT INTO rex_001_01_sales (
         id, firm_nr, period_nr, fiche_no, fiche_type, date,
         total_net, total_vat, total_gross, currency, payment_method, status, is_cancelled
       ) VALUES ($1,'001','01',$2,1,CURRENT_DATE, 250, 50, 300, 'TRY', 'cash', 'completed', false)`,
      [saleId, ficheNo],
    );

    const q = await client.query(
      `SELECT id::text, status, table_name FROM sync_queue WHERE record_id=$1::uuid`,
      [saleId],
    );
    if (!q.rows.length || q.rows[0].status !== 'pending') {
      throw new Error('sync_queue pending oluşmadı');
    }
    console.log('✅ sync_queue pending:', q.rows[0].table_name);

    console.log('\n▶ 2) OFFLINE doğrulama — merkezde yok');
    const mid = await restGet(`/rex_001_01_sales?fiche_no=eq.${encodeURIComponent(ficheNo)}&select=fiche_no`);
    if (mid.body?.length) throw new Error('Offline iken merkeze gitmiş');
    console.log('✅ Merkezde kayıt yok');

    console.log('\n▶ 3) ONLINE — yerel → lovan senkron');
    const sync = await syncPendingSale(client);
    if (sync.errors.length) throw new Error(sync.errors.join('; '));
    console.log('✅ Senkron:', sync.synced, 'kayıt');

    console.log('\n▶ 4) Merkez doğrulama');
    const after = await restGet(
      `/rex_001_01_sales?fiche_no=eq.${encodeURIComponent(ficheNo)}&select=fiche_no,total_gross,payment_method`,
    );
    if (!after.body?.length) throw new Error('Merkezde satış bulunamadı');
    console.log('✅ Merkez satış:', after.body[0]);

    const done = await client.query(`SELECT status FROM sync_queue WHERE record_id=$1::uuid`, [saleId]);
    if (done.rows[0]?.status !== 'completed') throw new Error('Yerel kuyruk completed değil');
    console.log('✅ Yerel sync_queue completed');

    console.log('\n=== SONUÇ: Satış hibrit senkron başarılı ===');

    console.log('\n▶ Temizlik');
    await client.query(`DELETE FROM rex_001_01_sales WHERE id=$1::uuid`, [saleId]);
    await fetch(`${LOVAN_REST}/rex_001_01_sales?id=eq.${saleId}`, {
      method: 'DELETE',
      headers: { 'Accept-Profile': 'public', 'Content-Profile': 'public', Prefer: 'return=minimal' },
    }).catch(() => {});
    console.log('✅ Test verisi temizlendi');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('\n❌ Test başarısız:', e.message || e);
  process.exit(1);
});

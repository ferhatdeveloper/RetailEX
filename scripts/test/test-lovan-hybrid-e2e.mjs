#!/usr/bin/env node
/**
 * Lovan hibrit E2E: yerelde veri → offline (senkron yok) → online → merkeze yükleme
 *
 * Kullanım: node scripts/test/test-lovan-hybrid-e2e.mjs
 */

import pg from 'pg';

const { Client } = pg;

const LOVAN_REST = 'https://api.retailex.app/lovan';
const LOCAL = {
  host: '127.0.0.1',
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
};

const TEST_CODE = `HYBRID_LOVAN_${Date.now()}`;
const TEST_ID = crypto.randomUUID();
const TEST_NAME = `Hibrit Test Müşteri ${new Date().toISOString()}`;

const log = {
  ok: (m, d) => console.log(`✅ ${m}${d ? ` — ${d}` : ''}`),
  fail: (m, d) => console.error(`❌ ${m}${d ? ` — ${d}` : ''}`),
  step: (m) => console.log(`\n▶ ${m}`),
};

async function restGet(path) {
  const url = `${LOVAN_REST}${path}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Profile': 'public' } });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function restUpsert(table, data) {
  const url = `${LOVAN_REST}/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function restPatchSyncQueue(id, patch) {
  const url = `${LOVAN_REST}/sync_queue?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  return { ok: res.ok, status: res.status };
}

/** runHybridSync local_to_remote (PostgREST hedef) — tek parti */
async function syncLocalPendingToLovan(client) {
  const pendingRes = await client.query(
    `SELECT id::text, table_name, record_id::text, action, firm_nr, data, retry_count
     FROM sync_queue
     WHERE status = 'pending' AND retry_count < 10 AND record_id = $1::uuid
     ORDER BY created_at ASC
     LIMIT 10`,
    [TEST_ID],
  );

  let synced = 0;
  let failed = 0;
  const errors = [];

  for (const row of pendingRes.rows) {
    const action = String(row.action).toUpperCase();
    try {
      if (action === 'DELETE') {
        const del = await fetch(`${LOVAN_REST}/${row.table_name}?id=eq.${encodeURIComponent(row.record_id)}`, {
          method: 'DELETE',
          headers: { Accept: 'application/json', 'Accept-Profile': 'public', 'Content-Profile': 'public', Prefer: 'return=minimal' },
        });
        if (!del.ok && del.status !== 404) throw new Error(`DELETE ${del.status}`);
      } else {
        const upsert = await restUpsert(row.table_name, row.data);
        if (!upsert.ok) throw new Error(`UPSERT ${upsert.status}: ${JSON.stringify(upsert.body).slice(0, 300)}`);
      }
      await client.query(
        `UPDATE sync_queue SET status = 'completed', synced_at = NOW(), error_message = NULL WHERE id = $1::uuid`,
        [row.id],
      );
      synced += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      await client.query(
        `UPDATE sync_queue SET retry_count = retry_count + 1, error_message = $2 WHERE id = $1::uuid`,
        [row.id, msg.slice(0, 2000)],
      );
    }
  }
  return { synced, failed, errors };
}

async function main() {
  console.log('\n=== Lovan Hibrit E2E Test ===');
  console.log(`Test kodu: ${TEST_CODE}\n`);

  const client = new Client(LOCAL);
  await client.connect();

  try {
    // 0) Uzakta kayıt yok
    log.step('0) Başlangıç — merkezde (lovan) kayıt yok');
    const before = await restGet(`/rex_001_customers?code=eq.${encodeURIComponent(TEST_CODE)}&select=id,code,name`);
    if (!before.ok) throw new Error(`Merkez sorgu hatası: ${before.status}`);
    if (Array.isArray(before.body) && before.body.length > 0) {
      throw new Error('Test kodu merkezde zaten var — farklı kod deneyin');
    }
    log.ok('Merkez temiz', TEST_CODE);

    // 1) OFFLINE — yerelde veri ekle
    log.step('1) OFFLINE — yerel PostgreSQL\'e müşteri ekle (internet yok varsayımı)');
    await client.query(
      `INSERT INTO rex_001_customers (id, firm_nr, code, name, phone, is_active, balance)
       VALUES ($1::uuid, '001', $2, $3, '05550000000', true, 0)`,
      [TEST_ID, TEST_CODE, TEST_NAME],
    );
    log.ok('Yerel INSERT', TEST_NAME);

    const queueRow = await client.query(
      `SELECT id::text, status, table_name, record_id::text
       FROM sync_queue
       WHERE record_id = $1::uuid AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [TEST_ID],
    );
    if (queueRow.rows.length === 0) {
      throw new Error('sync_queue\'da pending kayıt oluşmadı — enqueue_sync_event tetikleyici kontrol edin');
    }
    log.ok('sync_queue pending', `id=${queueRow.rows[0].id} tablo=${queueRow.rows[0].table_name}`);

    // 2) OFFLINE — merkeze gitmedi
    log.step('2) OFFLINE doğrulama — senkron çalıştırılmadı, merkezde hâlâ yok');
    const mid = await restGet(`/rex_001_customers?code=eq.${encodeURIComponent(TEST_CODE)}&select=id`);
    if (!mid.ok) throw new Error(`Merkez sorgu: ${mid.status}`);
    if (Array.isArray(mid.body) && mid.body.length > 0) {
      throw new Error('OFFLINE iken merkeze veri gitmiş — beklenmeyen durum');
    }
    log.ok('Merkezde kayıt yok (offline OK)');

    const pendingCount = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM sync_queue WHERE record_id = $1::uuid AND status = 'pending'`,
      [TEST_ID],
    );
    log.ok('Yerel kuyruk bekliyor', `${pendingCount.rows[0].cnt} pending`);

    // 3) ONLINE — internet geldi, hibrit senkron
    log.step('3) ONLINE — hibrit senkron (yerel → lovan merkez PostgREST)');
    const syncProbe = await restGet('/sync_queue?select=id&limit=1');
    if (!syncProbe.ok) throw new Error(`Lovan sync_queue erişilemiyor: ${syncProbe.status}`);
    log.ok('Lovan PostgREST erişilebilir');

    const syncResult = await syncLocalPendingToLovan(client);
    if (syncResult.failed > 0) {
      throw new Error(`Senkron başarısız: ${syncResult.errors.join('; ')}`);
    }
    log.ok('Senkron tamamlandı', `${syncResult.synced} kayıt`);

    // 4) Merkezde doğrula
    log.step('4) Merkez doğrulama — lovan API\'de müşteri var mı?');
    await new Promise((r) => setTimeout(r, 500));
    const after = await restGet(`/rex_001_customers?code=eq.${encodeURIComponent(TEST_CODE)}&select=id,code,name`);
    if (!after.ok || !Array.isArray(after.body) || after.body.length === 0) {
      throw new Error(`Merkezde kayıt bulunamadı: ${JSON.stringify(after.body)}`);
    }
    const remote = after.body[0];
    if (remote.name !== TEST_NAME) {
      throw new Error(`İsim uyuşmazlığı: ${remote.name} !== ${TEST_NAME}`);
    }
    log.ok('Merkezde kayıt doğrulandı', `${remote.code} — ${remote.name}`);

    const completed = await client.query(
      `SELECT status FROM sync_queue WHERE record_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [TEST_ID],
    );
    if (completed.rows[0]?.status !== 'completed') {
      throw new Error(`Yerel kuyruk status: ${completed.rows[0]?.status}`);
    }
    log.ok('Yerel sync_queue completed');

    console.log('\n=== SONUÇ: Hibrit akış başarılı ===');
    console.log('• Offline: yerel PG + sync_queue pending');
    console.log('• Online: yerel → lovan merkez PostgREST');
    console.log(`• Test müşteri: ${TEST_CODE}`);

    // Temizlik (opsiyonel — merkezde bırakılabilir)
    log.step('5) Temizlik');
    await client.query(`DELETE FROM rex_001_customers WHERE id = $1::uuid`, [TEST_ID]);
    await fetch(`${LOVAN_REST}/rex_001_customers?id=eq.${TEST_ID}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', 'Accept-Profile': 'public', 'Content-Profile': 'public', Prefer: 'return=minimal' },
    }).catch(() => {});
    log.ok('Test verisi temizlendi');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('\n💥 Test başarısız:', e.message || e);
  process.exit(1);
});

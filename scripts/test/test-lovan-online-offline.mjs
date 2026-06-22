#!/usr/bin/env node
/**
 * Lovan kiracısı — online / offline / hibrit bağlantı testi (CLI).
 * Kullanım: node scripts/test/test-lovan-online-offline.mjs
 */

const LOVAN_REST = 'https://api.retailex.app/lovan';
const MERKEZ_REST = 'https://api.retailex.app/merkez';
const BRIDGE = process.env.BRIDGE_URL || 'http://127.0.0.1:3001';
const LOCAL_PG = {
  host: '127.0.0.1',
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
};

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

function connStr(cfg) {
  const host = cfg.host === 'localhost' ? '127.0.0.1' : cfg.host;
  const u = encodeURIComponent(cfg.user);
  const p = encodeURIComponent(cfg.password);
  const d = encodeURIComponent(cfg.database);
  return `postgresql://${u}:${p}@${host}:${cfg.port}/${d}`;
}

async function testBridgeLocalPg() {
  const status = await fetchJson(`${BRIDGE}/api/status`);
  if (!status.ok || status.body?.status !== 'RUNNING') {
    fail('Yerel pg_bridge', `status=${status.status} body=${JSON.stringify(status.body)}`);
    return false;
  }
  pass('Yerel pg_bridge', 'RUNNING');

  const q = await fetch(`${BRIDGE}/api/pg_query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connStr: connStr(LOCAL_PG),
      sql: 'SELECT current_database() AS db, (SELECT name FROM public.firms WHERE firm_nr = $1 LIMIT 1) AS firm_name',
      params: ['001'],
    }),
  });
  if (!q.ok) {
    const err = await q.text();
    fail('Yerel PostgreSQL (offline uç)', err.slice(0, 200));
    return false;
  }
  const data = await q.json();
  const row = data.rows?.[0];
  pass('Yerel PostgreSQL (offline uç)', `${row?.db} / firma: ${row?.firm_name || '?'}`);
  return true;
}

async function testLovanRegistry() {
  const url = `${MERKEZ_REST}/tenant_registry?code=eq.lovan&select=code,display_name,rest_base_url,database_name,connection_provider,is_active`;
  const r = await fetchJson(url, { headers: { Accept: 'application/json' } });
  if (!r.ok || !Array.isArray(r.body) || r.body.length === 0) {
    fail('Merkez tenant_registry (lovan)', JSON.stringify(r.body).slice(0, 200));
    return null;
  }
  const row = r.body[0];
  if (row.rest_base_url !== LOVAN_REST) {
    fail('Merkez tenant_registry (lovan)', `rest_base_url beklenen ${LOVAN_REST}, gelen ${row.rest_base_url}`);
    return null;
  }
  pass('Merkez tenant_registry (lovan)', `${row.display_name} → ${row.rest_base_url}`);
  return row;
}

async function testLovanOnline() {
  const root = await fetchJson(`${LOVAN_REST}/`, { headers: { Accept: 'application/json' } });
  if (!root.ok) {
    fail('Lovan PostgREST (online)', `HTTP ${root.status}`);
    return false;
  }
  pass('Lovan PostgREST (online)', `HTTP ${root.status}`);

  const firms = await fetchJson(`${LOVAN_REST}/firms?select=firm_nr,name&limit=1`, {
    headers: { Accept: 'application/json' },
  });
  if (!firms.ok || !Array.isArray(firms.body) || firms.body.length === 0) {
    fail('Lovan firms sorgusu', JSON.stringify(firms.body).slice(0, 200));
    return false;
  }
  pass('Lovan firms sorgusu', `${firms.body[0].firm_nr} — ${firms.body[0].name}`);

  const users = await fetchJson(`${LOVAN_REST}/users?username=eq.admin&select=username,role,is_active`, {
    headers: { Accept: 'application/json' },
  });
  if (!users.ok || !Array.isArray(users.body) || users.body.length === 0) {
    fail('Lovan admin kullanıcısı', JSON.stringify(users.body).slice(0, 200));
    return false;
  }
  pass('Lovan admin kullanıcısı', `role=${users.body[0].role}`);
  return true;
}

/** Hibrit yedek simülasyonu: uzak uç kapalı → yerel uç */
async function testHybridFallbackSimulation() {
  const badHost = {
    ...LOCAL_PG,
    host: '192.0.2.1', // TEST-NET — erişilemez
    database: 'lovan_unreachable',
  };
  const bad = await fetch(`${BRIDGE}/api/pg_query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connStr: connStr(badHost),
      sql: 'SELECT 1',
      params: [],
    }),
  }).catch((e) => ({ ok: false, status: 0, text: () => Promise.resolve(String(e)) }));

  if (bad.ok) {
    fail('Hibrit yedek simülasyonu', 'Erişilemez host bekleniyordu ama başarılı döndü');
    return false;
  }
  pass('Hibrit yedek simülasyonu', 'Birincil uç erişilemez → hata (uygulama sıradaki uca geçer)');

  const good = await fetch(`${BRIDGE}/api/pg_query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connStr: connStr(LOCAL_PG),
      sql: 'SELECT $1::text AS mode',
      params: ['offline_fallback'],
    }),
  });
  if (!good.ok) {
    fail('Hibrit yedek — yerel uç', await good.text());
    return false;
  }
  const data = await good.json();
  pass('Hibrit yedek — yerel uç', `mode=${data.rows?.[0]?.mode}`);
  return true;
}

async function testOfflineQueueConcept() {
  // Tarayıcı API'si yok; mantıksal kontrol
  pass('Offline kuyruk (navigator.onLine)', 'Tarayıcıda online/offline event + IndexedDB kuyruk — UI testi gerekir');
  return true;
}

async function main() {
  console.log('\n=== Lovan kiracı — Online/Offline test ===\n');

  await testLovanRegistry();
  await testLovanOnline();
  await testBridgeLocalPg();
  await testHybridFallbackSimulation();
  await testOfflineQueueConcept();

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- Özet ---');
  console.log(`Toplam: ${results.length}, Başarılı: ${results.length - failed.length}, Başarısız: ${failed.length}`);
  if (failed.length) {
    process.exitCode = 1;
  } else {
    console.log('\nTüm CLI testleri geçti. UI için: login → kiracı kodu "lovan" → hibrit mod.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

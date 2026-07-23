#!/usr/bin/env node
/**
 * RetailEX mobil — ana modül API birim smoke (pg_bridge).
 * Okuma sorguları: POS / Faturalar / Cari / WMS / Restoran / Güzellik / Finans / Terazi / Raporlar.
 *
 * Kullanım (repo kökü):
 *   node scripts/test/mobile-module-api-smoke.mjs
 *   BRIDGE_URL=http://127.0.0.1:3001 FIRM_NR=001 PERIOD_NR=01 node scripts/test/mobile-module-api-smoke.mjs
 *
 * Çıkış: 0 = tüm zorunlu kontroller GEÇTİ; 1 = en az bir KALDI.
 * JSON özet: stdout son satır #JSON# {...}
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MOBILE = path.join(ROOT, 'mobile');
const BRIDGE = (process.env.BRIDGE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

const results = [];

function pass(module, name, detail = '') {
  results.push({ module, name, ok: true, detail });
  console.log(`  ✅ [${module}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(module, name, detail = '') {
  results.push({ module, name, ok: false, detail });
  console.error(`  ❌ [${module}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(module, name, detail = '') {
  results.push({ module, name, ok: null, detail });
  console.log(`  ⏭ [${module}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function decodeB64(s) {
  try {
    return Buffer.from(String(s || ''), 'base64').toString('utf8');
  } catch {
    return String(s || '');
  }
}

function loadPgFromConfigDb() {
  const candidates = [
    process.env.CONFIG_DB,
    'C:/RetailEX/config.db',
    'C:/RetailEx/config.db',
    path.join(ROOT, 'config.db'),
  ].filter(Boolean);
  let configPath = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      configPath = p;
      break;
    }
  }
  if (!configPath) return null;

  const sqlite = new Database(configPath, { readonly: true });
  const row = sqlite.prepare('SELECT data FROM config WHERE id=1').get();
  sqlite.close();
  if (!row?.data) return null;
  const c = JSON.parse(row.data);
  const parseDb = (s) => {
    const m = String(s || '').match(/^([^:]+):(\d+)\/(.+)$/);
    return m ? { host: m[1], port: Number(m[2]), database: m[3] } : null;
  };
  const local = parseDb(c.local_db) || {
    host: '127.0.0.1',
    port: 5432,
    database: 'retailex_local',
  };
  const remote = parseDb(c.remote_db) || {
    host: '127.0.0.1',
    port: 5432,
    database: 'retailex_local',
  };
  local.user = c.pg_local_user || 'postgres';
  local.password = decodeB64(c.pg_local_pass) || process.env.PGPASSWORD || 'postgres';
  remote.user = c.pg_remote_user || 'postgres';
  remote.password = decodeB64(c.pg_remote_pass) || process.env.PGPASSWORD || '';
  const mode = c.db_mode === 'online' ? 'online' : 'local';
  return { configPath, mode, local, remote, firmHint: c.erp_firm_nr, periodHint: c.erp_period_nr };
}

function connStr(ep) {
  const host = ep.host === 'localhost' ? '127.0.0.1' : ep.host;
  const u = encodeURIComponent(ep.user || 'postgres');
  const p = encodeURIComponent(ep.password || '');
  const d = encodeURIComponent(ep.database);
  return `postgresql://${u}:${p}@${host}:${ep.port}/${d}`;
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

async function pgQuery(cs, sql, params = []) {
  const res = await fetch(`${BRIDGE}/api/pg_query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connStr: cs, sql, params }),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }
  if (!res.ok) {
    const err = body?.error || `HTTP ${res.status}`;
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  return { rows: body.rows || [], rowCount: body.rowCount ?? (body.rows?.length || 0) };
}

function firmTables(fn, pn) {
  return {
    products: `rex_${fn}_products`,
    customers: `rex_${fn}_customers`,
    sales: `rex_${fn}_${pn}_sales`,
    saleItems: `rex_${fn}_${pn}_sale_items`,
    cashReg: `rex_${fn}_cash_registers`,
    cashLines: `rex_${fn}_${pn}_cash_lines`,
    bankReg: `rex_${fn}_bank_registers`,
    restTables: `rex_${fn}_rest_tables`,
    restOrders: `rex_${fn}_${pn}_rest_orders`,
    beautyAppt: `rex_${fn}_${pn}_beauty_appointments`,
    beautySvc: `rex_${fn}_beauty_services`,
    beautySp: `rex_${fn}_beauty_specialists`,
  };
}

async function assertSelect(module, name, cs, sql, params = [], opts = {}) {
  try {
    const r = await pgQuery(cs, sql, params);
    const n = r.rowCount;
    if (opts.requireRows && n === 0) {
      fail(module, name, '0 satır (beklenen ≥1)');
      return null;
    }
    pass(module, name, opts.detail?.(r) ?? `${n} satır`);
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (opts.allowMissing && /does not exist|relation|undefined_table/i.test(msg)) {
      skip(module, name, `tablo yok: ${msg.slice(0, 120)}`);
      return null;
    }
    fail(module, name, msg.slice(0, 220));
    return null;
  }
}

function assertFile(module, name, relPath) {
  const full = path.join(MOBILE, relPath);
  if (fs.existsSync(full)) pass(module, name, relPath);
  else fail(module, name, `eksik: ${relPath}`);
}

async function main() {
  console.log('=== RetailEX mobile module API smoke ===');
  console.log(`Bridge: ${BRIDGE}`);
  console.log(`Tarih: ${new Date().toISOString()}`);

  // —— Bridge ——
  const status = await fetchJson(`${BRIDGE}/api/status`);
  if (!status.ok || status.body?.status !== 'RUNNING') {
    fail('infra', 'bridge /api/status', `status=${status.status}`);
    printSummary();
    process.exit(1);
  }
  pass('infra', 'bridge /api/status', 'RUNNING');

  const cfg = loadPgFromConfigDb();
  if (!cfg) {
    fail('infra', 'config.db', 'bulunamadı');
    printSummary();
    process.exit(1);
  }
  const ep = cfg.mode === 'online' ? cfg.remote : cfg.local;
  pass('infra', 'config.db', `${cfg.configPath} mode=${cfg.mode} → ${ep.host}/${ep.database}`);
  const cs = connStr(ep);

  try {
    const ver = await pgQuery(cs, 'SELECT current_database() AS db, version() AS v');
    pass('infra', 'pg SELECT version', `${ver.rows[0]?.db}`);
  } catch (e) {
    fail('infra', 'pg SELECT version', e instanceof Error ? e.message : String(e));
    printSummary();
    process.exit(1);
  }

  let firmNr = normalizeFirm(process.env.FIRM_NR || cfg.firmHint || '001');
  let periodNr = normalizePeriod(process.env.PERIOD_NR || cfg.periodHint || '01');

  try {
    const firms = await pgQuery(
      cs,
      `SELECT firm_nr FROM firms WHERE COALESCE(is_active,true)=true ORDER BY firm_nr LIMIT 1`,
    );
    if (firms.rows[0]?.firm_nr && !process.env.FIRM_NR) {
      firmNr = normalizeFirm(firms.rows[0].firm_nr);
    }
  } catch {
    /* keep default */
  }
  pass('infra', 'oturum varsayılanı', `firm=${firmNr} period=${periodNr}`);

  const T = firmTables(firmNr, periodNr);

  // —— Dosya / ekran varlığı ——
  const screenChecks = [
    ['POS', 'src/screens/PosScreen.tsx', 'src/api/posApi.ts'],
    ['Faturalar', 'src/screens/InvoicesScreen.tsx', 'src/api/invoicesApi.ts'],
    ['Cari', 'src/screens/CustomersScreen.tsx', 'src/api/customersApi.ts'],
    ['WMS', 'src/screens/WmsScreen.tsx', 'src/api/wmsApi.ts'],
    ['Restoran', 'src/screens/RestaurantScreen.tsx', 'src/api/restaurantApi.ts'],
    ['Güzellik', 'src/screens/BeautyScreen.tsx', 'src/api/beautyApi.ts'],
    ['Finans', 'src/screens/FinanceScreen.tsx', 'src/api/cashApi.ts'],
    ['Terazi', 'src/screens/ScaleManagementScreen.tsx', 'src/api/scaleProductsApi.ts'],
    ['Raporlar', 'src/screens/ReportsScreen.tsx', 'src/api/reportsApi.ts'],
  ];
  for (const [mod, screen, api] of screenChecks) {
    assertFile(mod, 'ekran dosyası', screen);
    assertFile(mod, 'API dosyası', api);
  }

  // —— POS ——
  await assertSelect(
    'POS',
    'ürün listesi (sepet kaynağı)',
    cs,
    `SELECT id, code, name, COALESCE(price,0)::float8 AS price, COALESCE(stock,0)::float8 AS stock
     FROM ${T.products}
     WHERE COALESCE(is_active,true)=true
     ORDER BY name ASC LIMIT 5`,
  );
  await assertSelect(
    'POS',
    'satış tablosu okuma',
    cs,
    `SELECT id, fiche_no, COALESCE(net_amount,total_net,total_gross,0)::float8 AS net
     FROM ${T.sales}
     WHERE COALESCE(is_cancelled,false)=false
     ORDER BY date DESC NULLS LAST LIMIT 5`,
  );

  // —— Faturalar ——
  await assertSelect(
    'Faturalar',
    'fetchInvoices eşdeğeri',
    cs,
    `SELECT id, fiche_no, date::text AS date, customer_name,
            COALESCE(net_amount,total_net,total_gross,0)::float8 AS net_amount
     FROM ${T.sales}
     WHERE COALESCE(is_cancelled,false)=false
     ORDER BY date DESC NULLS LAST LIMIT 10`,
  );
  await assertSelect(
    'Faturalar',
    'sale_items kalem okuma',
    cs,
    `SELECT COUNT(*)::int AS n FROM ${T.saleItems}`,
  );

  // —— Cari ——
  await assertSelect(
    'Cari',
    'fetchCustomers eşdeğeri',
    cs,
    `SELECT id, code, name, phone, COALESCE(balance,0)::float8 AS balance
     FROM ${T.customers}
     WHERE COALESCE(is_active,true)=true
     ORDER BY name ASC LIMIT 10`,
  );

  // —— WMS ——
  await assertSelect(
    'WMS',
    'fetchWmsStock eşdeğeri',
    cs,
    `SELECT id, code, name, COALESCE(stock,0)::float8 AS stock, min_stock, unit
     FROM ${T.products}
     WHERE COALESCE(is_active,true)=true
     ORDER BY COALESCE(stock,0) ASC, name ASC LIMIT 10`,
  );
  await assertSelect(
    'WMS',
    'fetchWmsSummary eşdeğeri',
    cs,
    `SELECT COUNT(*)::int AS product_count,
            COUNT(*) FILTER (WHERE min_stock IS NOT NULL AND COALESCE(stock,0) < min_stock)::int AS below_min,
            COUNT(*) FILTER (WHERE COALESCE(stock,0) <= 0)::int AS zero_stock
     FROM ${T.products}
     WHERE COALESCE(is_active,true)=true`,
  );

  // —— Restoran (şema yoksa ATLANDI) ——
  await assertSelect(
    'Restoran',
    'masalar',
    cs,
    `SELECT id, COALESCE(number, id::text) AS name, status
     FROM ${T.restTables} ORDER BY number ASC LIMIT 20`,
    [],
    { allowMissing: true },
  );
  await assertSelect(
    'Restoran',
    'açık adisyonlar',
    cs,
    `SELECT id, order_no, status, COALESCE(total_amount,0)::float8 AS total_amount
     FROM ${T.restOrders}
     WHERE status IS DISTINCT FROM 'closed' AND status IS DISTINCT FROM 'cancelled'
     ORDER BY created_at DESC NULLS LAST LIMIT 10`,
    [],
    { allowMissing: true },
  );

  // —— Güzellik ——
  await assertSelect(
    'Güzellik',
    'hizmetler',
    cs,
    `SELECT id, name, COALESCE(price,0)::float8 AS price FROM ${T.beautySvc}
     WHERE COALESCE(is_active,true)=true ORDER BY name ASC LIMIT 20`,
    [],
    { allowMissing: true },
  );
  await assertSelect(
    'Güzellik',
    'uzmanlar',
    cs,
    `SELECT id, name FROM ${T.beautySp}
     WHERE COALESCE(is_active,true)=true ORDER BY name ASC LIMIT 20`,
    [],
    { allowMissing: true },
  );
  await assertSelect(
    'Güzellik',
    'randevular',
    cs,
    `SELECT id, status, appointment_date::text AS d FROM ${T.beautyAppt}
     ORDER BY appointment_date DESC NULLS LAST LIMIT 10`,
    [],
    { allowMissing: true },
  );

  // —— Finans ——
  await assertSelect(
    'Finans',
    'kasa tanımları',
    cs,
    `SELECT id::text AS id, code, name, COALESCE(balance,0)::float8 AS balance
     FROM ${T.cashReg}
     WHERE COALESCE(is_active,true)=true
     ORDER BY code ASC NULLS LAST LIMIT 20`,
  );
  await assertSelect(
    'Finans',
    'kasa hareketleri',
    cs,
    `SELECT id::text AS id, fiche_no, COALESCE(amount,0)::float8 AS amount
     FROM ${T.cashLines}
     ORDER BY date DESC NULLS LAST LIMIT 10`,
    [],
    { allowMissing: true },
  );
  await assertSelect(
    'Finans',
    'banka hesapları',
    cs,
    `SELECT id::text AS id, code, COALESCE(bank_name,name) AS name, COALESCE(balance,0)::float8 AS balance
     FROM ${T.bankReg}
     WHERE COALESCE(is_active,true)=true
     ORDER BY code ASC NULLS LAST LIMIT 20`,
    [],
    { allowMissing: true },
  );

  // —— Terazi ——
  await assertSelect(
    'Terazi',
    'fetchScaleProducts eşdeğeri',
    cs,
    `SELECT id, code, name, COALESCE(price,0)::float8 AS price, plu_code
     FROM ${T.products}
     WHERE COALESCE(is_active,true)=true
       AND COALESCE(is_scale_product,false)=true
     ORDER BY name ASC LIMIT 20`,
  );
  // TCP test endpoint (cihaz şart değil — endpoint varlığı)
  try {
    const r = await fetch(`${BRIDGE}/api/scale/rongta/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', port: 1 }),
    });
    // 4xx/timeout beklenir; 404 = route yok = KALDI
    if (r.status === 404) fail('Terazi', 'bridge rongta/test route', `HTTP ${r.status}`);
    else pass('Terazi', 'bridge rongta/test route', `HTTP ${r.status} (cihaz yoksa normal)`);
  } catch (e) {
    fail('Terazi', 'bridge rongta/test route', e instanceof Error ? e.message : String(e));
  }

  // —— Raporlar ——
  await assertSelect(
    'Raporlar',
    'günlük satış (fetchSalesByDay)',
    cs,
    `SELECT date_trunc('day', COALESCE(date::timestamp, created_at))::date::text AS day,
            COUNT(*)::int AS count
     FROM ${T.sales}
     WHERE COALESCE(is_cancelled,false)=false
       AND COALESCE(date::date, created_at::date) >= (CURRENT_DATE - interval '14 days')
     GROUP BY 1 ORDER BY 1 DESC`,
  );
  await assertSelect(
    'Raporlar',
    'kritik stok (fetchCriticalStock)',
    cs,
    `SELECT id, code, name, COALESCE(stock,0)::float8 AS stock, COALESCE(min_stock,0)::float8 AS min_stock
     FROM ${T.products}
     WHERE COALESCE(is_active,true)=true
       AND min_stock IS NOT NULL
       AND COALESCE(stock,0) < min_stock
     ORDER BY (min_stock - COALESCE(stock,0)) DESC
     LIMIT 20`,
  );

  const code = printSummary();
  process.exit(code);
}

function normalizeFirm(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '001';
  return d.length <= 3 ? d.padStart(3, '0') : d;
}

function normalizePeriod(v) {
  const p = String(v ?? '01').replace(/\D/g, '');
  return (p || '01').padStart(2, '0').slice(0, 10);
}

function printSummary() {
  const byMod = new Map();
  for (const r of results) {
    if (!byMod.has(r.module)) byMod.set(r.module, { pass: 0, fail: 0, skip: 0, items: [] });
    const m = byMod.get(r.module);
    if (r.ok === true) m.pass++;
    else if (r.ok === false) m.fail++;
    else m.skip++;
    m.items.push(r);
  }

  console.log('\n=== Modül özeti ===');
  const moduleRows = [];
  for (const [mod, s] of byMod) {
    const verdict = s.fail > 0 ? 'KALDI' : s.pass > 0 ? 'GEÇTİ' : 'ATLANDI';
    console.log(`${verdict.padEnd(8)} ${mod}: ${s.pass} geçti, ${s.fail} kaldı, ${s.skip} atlandı`);
    moduleRows.push({ module: mod, verdict, pass: s.pass, fail: s.fail, skip: s.skip });
  }

  const hardFail = results.filter((r) => r.ok === false).length;
  const summary = {
    at: new Date().toISOString(),
    bridge: BRIDGE,
    modules: moduleRows,
    checks: results,
    exit: hardFail > 0 ? 1 : 0,
  };
  console.log(`\n#JSON#${JSON.stringify(summary)}`);
  return hardFail > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * RetailEX mutfak yazdirma servisi.
 *
 * Windows hizmeti RetailEX_Printer tarafindan Node worker olarak calistirilir.
 * config.db icinden local/cloud PostgreSQL hedeflerini okur, mutfak print job
 * tablosunu poll eder ve ag ESC/POS yazicilarina ham TCP gonderir.
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const LOG_FILE = 'C:\\ProgramData\\RetailEX\\printer_service.log';
const POLL_MS = clampNumber(process.env.PRINT_POLL_MS, 500, 60_000, 2500);
const CLAIM_LIMIT = clampNumber(process.env.PRINT_CLAIM_LIMIT, 1, 50, 10);
const TCP_TIMEOUT_MS = clampNumber(process.env.PRINT_TCP_TIMEOUT_MS, 1000, 60_000, 8000);
const WORKER_ID = `RetailEX_Printer/${os.hostname()}/${process.pid}`;
const RUN_ONCE = process.argv.includes('--once') || process.env.PRINT_ONCE === '1';
const SHOW_HELP = process.argv.includes('--help') || process.argv.includes('-h');

const KITCHEN_I18N = {
  tr: {
    title: 'MUTFAK FİŞİ',
    tableSource: 'MASA / KAYNAK:',
    floor: 'BÖLGE:',
    waiter: 'GARSON:',
    time: 'SAAT:',
    empty: '(kalem yok)',
    footer: '- hazırlanacak -',
    colQty: 'Adet',
    colProduct: 'Ürün',
  },
  en: {
    title: 'KITCHEN TICKET',
    tableSource: 'TABLE / SOURCE:',
    floor: 'AREA:',
    waiter: 'SERVER:',
    time: 'TIME:',
    empty: '(no items)',
    footer: '- to prepare -',
    colQty: 'Qty',
    colProduct: 'Item',
  },
  ar: {
    title: 'فاتورة المطبخ',
    tableSource: 'طاولة / مصدر:',
    floor: 'منطقة:',
    waiter: 'نادل:',
    time: 'الوقت:',
    empty: '(لا عناصر)',
    footer: '- للتحضير -',
    colQty: 'العدد',
    colProduct: 'الصنف',
  },
  ku: {
    title: 'پسوولەی چێشتخانە',
    tableSource: 'مێز / سەرچاوە:',
    floor: 'ناوچە:',
    waiter: 'گەرسۆن:',
    time: 'کات:',
    empty: '(بێ بەرهەم)',
    footer: '- بۆ ئامادەکردن -',
    colQty: 'ژمارە',
    colProduct: 'بەرهەم',
  },
  uz: {
    title: 'OSHXONA CHEKI',
    tableSource: 'STOL / MANBA:',
    floor: 'HUDUD:',
    waiter: 'OFITSANT:',
    time: 'VAQT:',
    empty: "(mahsulot yo'q)",
    footer: '- tayyorlash uchun -',
    colQty: 'Soni',
    colProduct: 'Mahsulot',
  },
};

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function logLine(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  if (!IS_WIN) {
    console.log(line);
    return;
  }
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${line}\r\n`, 'utf8');
  } catch {
    console.log(line);
  }
}

function decodeConfigPass(s) {
  if (!s || typeof s !== 'string') return '';
  try {
    const compact = s.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return s;
    const b = Buffer.from(compact, 'base64');
    const t = b.toString('utf8');
    if (t && !t.includes('\0')) return t;
  } catch {}
  return s;
}

function parsePgEndpoint(raw, fallback) {
  const text = String(raw || '').trim();
  const m = text.match(/^([^:]+):(\d+)\/(.+)$/);
  if (!m) return fallback;
  return { host: m[1], port: Number(m[2]), database: m[3] };
}

function resolveConfigDbPath() {
  const candidates = [
    process.env.CONFIG_DB,
    'C:\\RetailEX\\config.db',
    'C:\\RetailEx\\config.db',
    path.join(process.cwd(), 'config.db'),
    path.join(ROOT, 'config.db'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function loadConfigDb() {
  const configPath = resolveConfigDbPath();
  if (!configPath) return null;

  let Database;
  try {
    const mod = await import('better-sqlite3');
    Database = mod.default;
  } catch (e) {
    logLine(`config.db okunamadi: better-sqlite3 yuklu degil (${e?.message || e})`);
    return null;
  }

  try {
    const db = new Database(configPath, { readonly: true });
    const hasConfig = db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='config' LIMIT 1")
      .get();
    if (!hasConfig) {
      db.close();
      // Bos / yanlis dosya (or. gelistirme kokunde bos config.db) — PG env'e dus
      return null;
    }
    const row = db.prepare('SELECT data FROM config WHERE id = 1').get();
    db.close();
    if (!row?.data) {
      logLine(`config.db icinde config id=1 yok: ${configPath}`);
      return null;
    }
    const config = JSON.parse(row.data);
    config.pg_local_pass = decodeConfigPass(config.pg_local_pass);
    config.pg_remote_pass = decodeConfigPass(config.pg_remote_pass);
    return { configPath, config };
  } catch (e) {
    logLine(`config.db okuma hatasi: ${e?.message || e}`);
    return null;
  }
}

function hasPgEnv() {
  return Boolean(process.env.PGHOST || process.env.PGDATABASE || process.env.PGUSER || process.env.PGPASSWORD);
}

function applyEnvPgOverrides(target) {
  return {
    ...target,
    host: process.env.PGHOST || target.host,
    port: process.env.PGPORT ? Number(process.env.PGPORT) || target.port : target.port,
    database: process.env.PGDATABASE || target.database,
    user: process.env.PGUSER || target.user,
    password: process.env.PGPASSWORD ?? target.password,
  };
}

function resolveTargets(configWrap) {
  const targets = [];
  const cfg = configWrap?.config;
  if (cfg) {
    const localEndpoint = parsePgEndpoint(cfg.local_db, null);
    if (localEndpoint) {
      targets.push({
        name: 'local',
        ...applyEnvPgOverrides({
          ...localEndpoint,
          user: cfg.pg_local_user || 'postgres',
          password: cfg.pg_local_pass || '',
        }),
      });
    }

    const mode = String(cfg.db_mode || '').toLowerCase();
    const remoteEndpoint = parsePgEndpoint(cfg.remote_db, null);
    if (remoteEndpoint && (mode === 'online' || mode === 'hybrid')) {
      targets.push({
        name: 'remote',
        ...remoteEndpoint,
        user: cfg.pg_remote_user || 'postgres',
        password: cfg.pg_remote_pass || '',
      });
    }
  }

  if (targets.length === 0 && hasPgEnv()) {
    targets.push({
      name: 'env',
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'retailex_local',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
    });
  }

  const seen = new Set();
  return targets.filter((t) => {
    const key = `${t.host}:${t.port}/${t.database}/${t.user}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(t.host && t.port && t.database);
  });
}

function onlyDigits(value, fallback) {
  const d = String(value ?? '').replace(/\D/g, '');
  return d || fallback;
}

function resolveFirmPeriod(configWrap) {
  const cfg = configWrap?.config || {};
  const firmRaw = process.env.PRINT_FIRM_NR ?? cfg.erp_firm_nr ?? cfg.firm_nr ?? cfg.firmNr;
  const periodRaw = process.env.PRINT_PERIOD_NR ?? cfg.erp_period_nr ?? cfg.period_nr ?? cfg.periodNr;
  const firm = onlyDigits(firmRaw, '1').padStart(3, '0').slice(-3);
  const period = onlyDigits(periodRaw, '1').padStart(2, '0').slice(-2);
  return { firm, period, table: `rex_${firm}_${period}_kitchen_print_jobs` };
}

async function withClient(target, fn) {
  const client = new Client({
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.user,
    password: target.password,
    connectionTimeoutMillis: 3000,
    query_timeout: 20_000,
    application_name: 'RetailEX_Printer',
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function tableExists(client, tableName) {
  const res = await client.query('SELECT to_regclass($1) AS oid', [`rest.${tableName}`]);
  return Boolean(res.rows[0]?.oid);
}

function tableSql(tableName) {
  if (!/^rex_\d{3}_\d{2}_kitchen_print_jobs$/.test(tableName)) {
    throw new Error(`Gecersiz mutfak print job tablo adi: ${tableName}`);
  }
  return `rest.${tableName}`;
}

async function claimJobs(client, tableName) {
  const tbl = tableSql(tableName);
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `
        UPDATE ${tbl}
           SET status = 'printing',
               claimed_by = $1,
               claimed_at = NOW(),
               attempts = COALESCE(attempts, 0) + 1
         WHERE id IN (
           SELECT id
             FROM ${tbl}
            WHERE status IN ('pending', 'failed')
              AND COALESCE(attempts, 0) < 5
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $2
         )
         RETURNING *
      `,
      [WORKER_ID, CLAIM_LIMIT],
    );
    await client.query('COMMIT');
    return res.rows;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    const msg = String(e?.message || e);
    if (!/SKIP LOCKED|syntax error|FOR UPDATE/i.test(msg)) throw e;
    logLine(`SKIP LOCKED desteklenmedi, fallback claim kullaniliyor: ${msg}`);
  }

  const res = await client.query(
    `
      UPDATE ${tbl}
         SET status = 'printing',
             claimed_by = $1,
             claimed_at = NOW(),
             attempts = COALESCE(attempts, 0) + 1
       WHERE id IN (
         SELECT id
           FROM ${tbl}
          WHERE status IN ('pending', 'failed')
            AND COALESCE(attempts, 0) < 5
          ORDER BY created_at
          LIMIT $2
       )
         AND status IN ('pending', 'failed')
         AND COALESCE(attempts, 0) < 5
       RETURNING *
    `,
    [WORKER_ID, CLAIM_LIMIT],
  );
  return res.rows;
}

async function markPrinted(client, tableName, id) {
  await client.query(
    `UPDATE ${tableSql(tableName)}
        SET status = 'printed',
            printed_at = NOW(),
            last_error = NULL
      WHERE id = $1`,
    [id],
  );
}

async function markFailed(client, tableName, id, error) {
  const text = String(error?.message || error || 'Yazdirma hatasi').slice(0, 1000);
  await client.query(
    `UPDATE ${tableSql(tableName)}
        SET status = 'failed',
            last_error = $2
      WHERE id = $1`,
    [id, text],
  );
}

function parsePayload(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  if (Buffer.isBuffer(raw)) return { escposBytes: raw };
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { text: raw };
    }
  }
  return {};
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function firstNumber(fallback, ...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1 && n <= 65535) return Math.floor(n);
  }
  return fallback;
}

function normalizeLocale(value) {
  return ['tr', 'en', 'ar', 'ku', 'uz'].includes(value) ? value : 'tr';
}

function normalizeJob(row) {
  const payload = parsePayload(row.payload);
  const printer = payload.printer || payload.target || payload.profile || {};
  const ticket = payload.ticket || payload.kitchenTicket || payload;
  const connection = firstString(
    row.connection,
    row.connection_type,
    payload.connection,
    payload.connectionType,
    printer.connection,
    printer.connectionType,
  ).toLowerCase();

  return {
    payload,
    ticket,
    connection,
    address: firstString(row.address, row.printer_address, payload.address, payload.host, printer.address, printer.host),
    port: firstNumber(9100, row.port, row.printer_port, payload.port, printer.port),
    systemName: firstString(row.system_name, row.printer_name, payload.systemName, payload.system_name, printer.systemName),
  };
}

function enc(text) {
  return Buffer.from(String(text ?? ''), 'utf8');
}

function esc(...bytes) {
  return Buffer.from(bytes);
}

function wrapText(value, width) {
  const text = String(value || '').replace(/\r/g, '').trim();
  if (!text) return [];
  if (text.length <= width) return [text];
  const out = [];
  let rest = text;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut < Math.floor(width * 0.45)) cut = width;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function padEndText(value, width) {
  const text = String(value || '').slice(0, width);
  return text + ' '.repeat(Math.max(0, width - text.length));
}

function ticketItems(ticket) {
  const items = Array.isArray(ticket.items)
    ? ticket.items
    : Array.isArray(ticket.lines)
      ? ticket.lines
      : Array.isArray(ticket.orderItems)
        ? ticket.orderItems
        : [];
  return items.map((item) => ({
    name: firstString(item.name, item.productName, item.product_name, item.title) || 'Ürün',
    quantity: Number(item.quantity ?? item.qty ?? item.count ?? 1) || 1,
    course: firstString(item.course, item.courseName, item.course_name),
    notes: firstString(item.notes, item.note, item.description),
    options: firstString(item.options, item.modifiers, item.extras),
  }));
}

function buildKitchenTicketEscPos(input) {
  if (input.payload?.escposBytes && Buffer.isBuffer(input.payload.escposBytes)) return input.payload.escposBytes;
  const base64 = firstString(
    input.payload?.escposBase64,
    input.payload?.escpos_b64,
    input.payload?.dataB64,
    input.payload?.data_b64,
  );
  if (base64) return Buffer.from(base64, 'base64');

  const ticket = input.ticket || {};
  const locale = normalizeLocale(ticket.locale || input.payload?.locale);
  const labels = KITCHEN_I18N[locale];
  const lineWidth = 40;
  const dash = `${'-'.repeat(lineWidth)}\n`;
  const parts = [
    esc(0x1b, 0x40),
    esc(0x1b, 0x61, 1),
    esc(0x1b, 0x21, 0x30),
    esc(0x1b, 0x45, 1),
    enc(`${labels.title}\n`),
    esc(0x1b, 0x45, 0),
    esc(0x1b, 0x21, 0),
    enc('\n'),
    esc(0x1b, 0x61, 0),
    enc(dash),
  ];

  const tableNumber = firstString(
    ticket.tableNumber,
    ticket.table_number,
    ticket.table,
    ticket.source,
    input.payload?.tableNumber,
    input.payload?.table_number,
  ) || 'Mutfak';
  parts.push(enc(`${labels.tableSource} ${tableNumber}\n`));

  const floorName = firstString(ticket.floorName, ticket.floor_name, ticket.location, ticket.area);
  if (floorName) parts.push(enc(`${labels.floor} ${floorName}\n`));
  const waiter = firstString(ticket.waiter, ticket.server, ticket.staffName, ticket.staff_name);
  if (waiter) parts.push(enc(`${labels.waiter} ${waiter}\n`));
  parts.push(enc(`${labels.time} ${new Date().toLocaleString(locale === 'en' ? 'en-GB' : 'tr-TR')}\n`));
  parts.push(enc(dash));

  const orderNote = firstString(ticket.orderNote, ticket.order_note, ticket.note, input.payload?.orderNote);
  if (orderNote) {
    for (const line of wrapText(orderNote, lineWidth)) parts.push(enc(`${line}\n`));
    parts.push(enc(dash));
  }

  const items = ticketItems(ticket);
  if (items.length === 0) {
    parts.push(enc(`${labels.empty}\n`));
  } else {
    parts.push(esc(0x1b, 0x45, 1), enc(`${padEndText(labels.colQty, 6)} ${labels.colProduct}\n`), esc(0x1b, 0x45, 0), enc(dash));
    for (const item of items) {
      const qty = `${item.quantity}x`;
      const nameLines = wrapText(item.name, lineWidth - 7);
      parts.push(esc(0x1b, 0x45, 1), enc(`${padEndText(qty, 6)} ${nameLines[0] || ''}\n`), esc(0x1b, 0x45, 0));
      for (const line of nameLines.slice(1)) parts.push(enc(`${padEndText('', 6)} ${line}\n`));
      const details = [item.notes, item.options, item.course ? `(${item.course})` : ''].filter(Boolean).join(' · ');
      for (const line of wrapText(details, lineWidth)) parts.push(enc(`  ${line}\n`));
    }
  }

  parts.push(enc(dash), esc(0x1b, 0x61, 1), enc(`${labels.footer}\n\n\n`), esc(0x1d, 0x56, 0x00));
  return Buffer.concat(parts);
}

async function sendEscPosTcp(host, port, payload) {
  if (!host) throw new Error('Ag yazicisi adresi bos.');
  if (!Buffer.isBuffer(payload) || payload.length === 0) throw new Error('ESC/POS verisi bos.');

  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once('connect', () => {
      socket.write(payload, (err) => {
        if (err) finish(err);
        else socket.end();
      });
    });
    socket.once('timeout', () => finish(new Error(`TCP yazici zaman asimi: ${host}:${port}`)));
    socket.once('error', finish);
    socket.once('close', (hadError) => {
      if (!hadError) finish();
    });
  });
}

async function printJob(row) {
  const job = normalizeJob(row);
  if (job.connection === 'system') {
    const name = job.systemName || '(adsiz sistem yazicisi)';
    throw new Error(`Sistem yazicisi desteklenmiyor (${name}); mutfak servisi icin Ag (IP) ESC/POS kullanin.`);
  }
  if (job.connection && job.connection !== 'network') {
    throw new Error(`Desteklenmeyen yazici baglantisi: ${job.connection}`);
  }
  if (!job.address) {
    throw new Error('Ag yazicisi adresi yok.');
  }
  const payload = buildKitchenTicketEscPos(job);
  await sendEscPosTcp(job.address, job.port, payload);
  return `${job.address}:${job.port} (${payload.length} bayt)`;
}

async function pollTarget(target, tableName) {
  await withClient(target, async (client) => {
    if (!(await tableExists(client, tableName))) {
      logLine(`${target.name}: rest.${tableName} yok, atlandi.`);
      return;
    }
    const jobs = await claimJobs(client, tableName);
    if (jobs.length > 0) logLine(`${target.name}: ${jobs.length} mutfak print job alindi.`);
    for (const row of jobs) {
      try {
        const info = await printJob(row);
        await markPrinted(client, tableName, row.id);
        logLine(`${target.name}: job ${row.id} printed -> ${info}`);
      } catch (e) {
        await markFailed(client, tableName, row.id, e).catch((markErr) => {
          logLine(`${target.name}: job ${row.id} failed, durum yazilamadi: ${markErr?.message || markErr}`);
        });
        logLine(`${target.name}: job ${row.id} failed: ${e?.message || e}`);
      }
    }
  });
}

async function pollOnce() {
  const configWrap = await loadConfigDb();
  const { firm, period, table } = resolveFirmPeriod(configWrap);
  const targets = resolveTargets(configWrap);
  if (targets.length === 0) {
    logLine('PostgreSQL hedefi yok: config.db veya PGHOST/PGDATABASE ayarlari bulunamadi.');
    return;
  }
  logLine(`Poll: firma=${firm}, donem=${period}, hedef=${targets.map((t) => `${t.name}:${t.host}/${t.database}`).join(', ')}`);
  for (const target of targets) {
    try {
      await pollTarget(target, table);
    } catch (e) {
      logLine(`${target.name}: PG erisim/poll hatasi: ${e?.message || e}`);
    }
  }
}

function printHelp() {
  const text = `RetailEX mutfak yazıcı servisi (kitchen-print-service)

Kullanım:
  node scripts/kitchen-print-service.mjs [--once] [--help]

Seçenekler:
  --once     Tek poll turu çalıştırıp çık
  --help     Bu yardımı göster

Ortam:
  CONFIG_DB, PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
  PRINT_FIRM_NR, PRINT_PERIOD_NR, PRINT_POLL_MS

Windows hizmeti: RetailEX_Printer.exe
Ayrıntı: DeskApp/resources/README_PRINTER_SERVICE.md
`;
  console.log(text);
}

async function main() {
  if (SHOW_HELP) {
    printHelp();
    return;
  }
  logLine(`RetailEX Printer worker started. worker=${WORKER_ID}, poll=${POLL_MS}ms`);
  do {
    await pollOnce();
    if (RUN_ONCE) break;
    await sleep(POLL_MS);
  } while (true);
}

main().catch((e) => {
  logLine(`Fatal error: ${e?.stack || e?.message || e}`);
  process.exit(1);
});

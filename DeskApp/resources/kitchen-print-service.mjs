#!/usr/bin/env node
/**
 * AsinERP Printer Service (unified).
 *
 * Windows hizmeti AsinERP_Printer tarafindan Node worker olarak calistirilir.
 * config.db icinden local/cloud PostgreSQL hedeflerini okur, unified print_jobs
 * ve legacy kitchen_print_jobs kuyruklarini poll eder.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const execFileAsync = promisify(execFile);
const LOG_FILE = 'C:\\ProgramData\\AsinERP\\printer_service.log';
const POLL_MS = clampNumber(process.env.PRINT_POLL_MS, 500, 60_000, 2500);
const CLAIM_LIMIT = clampNumber(process.env.PRINT_CLAIM_LIMIT, 1, 50, 10);
const TCP_TIMEOUT_MS = clampNumber(process.env.PRINT_TCP_TIMEOUT_MS, 1000, 60_000, 8000);
const WORKER_ID = `AsinERP_Printer/${os.hostname()}/${process.pid}`;
const RUN_ONCE = process.argv.includes('--once') || process.env.PRINT_ONCE === '1';
const SHOW_HELP = process.argv.includes('--help') || process.argv.includes('-h');
const LEGACY_JOB_TYPE = 'kitchen_ticket';
const HTML_JOB_TYPES = new Set([
  'html_document',
  'pos_receipt_80',
  'account_receipt',
  'invoice_a4',
  'report_html',
  'product_label',
]);
const TEMPLATE_CATALOG_CATEGORY = 'template_catalog';
const TEMPLATE_CATALOG_TYPE = 'template_designer_v2';

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
    'C:\\AsinERP\\config.db',
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
  return {
    firm,
    period,
    tables: [
      { tableName: `rex_${firm}_${period}_print_jobs`, legacy: false },
      { tableName: `rex_${firm}_${period}_kitchen_print_jobs`, legacy: true },
    ],
  };
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
    application_name: 'AsinERP_Printer',
  });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function tableInfo(client, tableName) {
  const res = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'rest'
        AND table_name = $1`,
    [tableName],
  );
  return {
    tableName,
    exists: res.rows.length > 0,
    columns: new Set(res.rows.map((r) => r.column_name)),
  };
}

function tableSql(tableName) {
  if (!/^rex_\d{3}_\d{2}_(kitchen_)?print_jobs$/.test(tableName)) {
    throw new Error(`Gecersiz print job tablo adi: ${tableName}`);
  }
  return `rest.${tableName}`;
}

function requireColumns(info, ...columns) {
  for (const column of columns) {
    if (!info.columns.has(column)) throw new Error(`rest.${info.tableName} kolon eksik: ${column}`);
  }
}

async function claimJobs(client, info, legacy) {
  requireColumns(info, 'id', 'status', 'payload');
  const tbl = tableSql(info.tableName);
  const attemptsExpr = info.columns.has('attempts') ? 'COALESCE(attempts, 0)' : '0';
  const orderColumn = info.columns.has('created_at') ? 'created_at' : 'id';
  const assignments = [`status = 'printing'`];
  if (info.columns.has('claimed_by')) assignments.push('claimed_by = $1');
  if (info.columns.has('claimed_at')) assignments.push('claimed_at = NOW()');
  if (info.columns.has('attempts')) assignments.push('attempts = COALESCE(attempts, 0) + 1');
  if (legacy && info.columns.has('job_type')) assignments.push(`job_type = COALESCE(job_type, '${LEGACY_JOB_TYPE}')`);

  try {
    await client.query('BEGIN');
    const res = await client.query(
      `
        UPDATE ${tbl}
           SET ${assignments.join(',\n               ')}
         WHERE id IN (
           SELECT id
             FROM ${tbl}
            WHERE status IN ('pending', 'failed')
              AND ${attemptsExpr} < 5
            ORDER BY ${orderColumn}
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
         SET ${assignments.join(',\n             ')}
       WHERE id IN (
         SELECT id
           FROM ${tbl}
          WHERE status IN ('pending', 'failed')
            AND ${attemptsExpr} < 5
          ORDER BY ${orderColumn}
          LIMIT $2
       )
         AND status IN ('pending', 'failed')
         AND ${attemptsExpr} < 5
       RETURNING *
    `,
    [WORKER_ID, CLAIM_LIMIT],
  );
  return res.rows;
}

async function markPrinted(client, info, id) {
  const assignments = [`status = 'printed'`];
  if (info.columns.has('printed_at')) assignments.push('printed_at = NOW()');
  if (info.columns.has('last_error')) assignments.push('last_error = NULL');
  await client.query(
    `UPDATE ${tableSql(info.tableName)}
        SET ${assignments.join(',\n            ')}
      WHERE id = $1`,
    [id],
  );
}

async function markFailed(client, info, id, error) {
  const text = String(error?.message || error || 'Yazdirma hatasi').slice(0, 1000);
  const assignments = [`status = 'failed'`];
  const params = [id];
  if (info.columns.has('last_error')) {
    params.push(text);
    assignments.push('last_error = $2');
  }
  await client.query(
    `UPDATE ${tableSql(info.tableName)}
        SET ${assignments.join(',\n            ')}
      WHERE id = $1`,
    params,
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

function firstObject(...values) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)) return value;
  }
  return {};
}

function normalizeLocale(value) {
  return ['tr', 'en', 'ar', 'ku', 'uz'].includes(value) ? value : 'tr';
}

function normalizeJob(row, context = {}) {
  const payload = parsePayload(row.payload);
  const printer = payload.printer || payload.target || payload.profile || {};
  const ticket = payload.ticket || payload.kitchenTicket || payload;
  const settings = context.settings || {};
  const connection = firstString(
    row.connection,
    row.connection_type,
    payload.connection,
    payload.connectionType,
    printer.connection,
    printer.connectionType,
  ).toLowerCase();
  const jobType = firstString(row.job_type, payload.jobType, payload.job_type, payload.kind, payload.type)
    .toLowerCase()
    .replace(/\s+/g, '_') || (context.legacy ? LEGACY_JOB_TYPE : '');

  return {
    payload,
    ticket,
    jobType,
    connection,
    address: firstString(row.address, row.printer_address, payload.address, payload.host, printer.address, printer.host),
    port: firstNumber(9100, row.port, row.printer_port, payload.port, printer.port),
    systemName: firstString(
      row.system_name,
      row.printer_name,
      payload.systemName,
      payload.system_name,
      payload.printerName,
      payload.printer_name,
      printer.systemName,
      printer.system_name,
      printer.name,
      settings.defaultSystemPrinterName,
      settings.defaultPrinterName,
      settings.printerName,
    ),
  };
}

function normalizePrinterServiceSettings(value) {
  const cfg = firstObject(value);
  return {
    defaultSystemPrinterName: firstString(
      cfg.defaultSystemPrinterName,
      cfg.default_system_printer_name,
      cfg.defaultPrinterName,
      cfg.default_printer_name,
      cfg.systemPrinterName,
      cfg.system_printer_name,
      cfg.printerName,
      cfg.printer_name,
    ),
    sumatraPath: firstString(cfg.sumatraPath, cfg.sumatra_path),
    browserPath: firstString(cfg.browserPath, cfg.browser_path),
  };
}

async function loadPrinterServiceSettings(client, firm) {
  try {
    const exists = await client.query("SELECT to_regclass('public.app_settings') AS oid");
    if (!exists.rows[0]?.oid) return {};
    const res = await client.query(
      `SELECT value
         FROM public.app_settings
        WHERE key = 'printer_service'
          AND (firm_nr = $1 OR firm_nr = '000')
        ORDER BY CASE WHEN firm_nr = $1 THEN 0 ELSE 1 END
        LIMIT 1`,
      [firm],
    );
    return normalizePrinterServiceSettings(res.rows[0]?.value);
  } catch (e) {
    logLine(`printer_service ayari okunamadi: ${e?.message || e}`);
    return {};
  }
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

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attrEscape(value) {
  return htmlEscape(value).replace(/`/g, '&#96;');
}

function cssColor(value, fallback = 'transparent') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return text;
  if (/^(rgb|rgba|hsl|hsla)\([0-9.,% /-]+\)$/i.test(text)) return text;
  if (/^[a-z]+$/i.test(text)) return text;
  return fallback;
}

function mm(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function lookupPath(data, token) {
  const pathText = String(token || '').trim();
  if (!pathText) return '';
  const parts = pathText.split('.').filter(Boolean);
  let cur = data;
  for (const part of parts) {
    if (cur == null) return '';
    const key = Array.isArray(cur) && /^\d+$/.test(part) ? Number(part) : part;
    cur = cur[key];
  }
  if (cur == null) return '';
  if (typeof cur === 'object') return JSON.stringify(cur);
  return String(cur);
}

function interpolateTemplateText(value, data) {
  return String(value ?? '').replace(/{{\s*([^{}]+?)\s*}}/g, (_m, token) => lookupPath(data, token));
}

function templateElementText(element, data) {
  const raw = firstString(element.content, element.field);
  return interpolateTemplateText(raw, data);
}

function renderTableElement(element, data) {
  const rows = Array.isArray(data?.items) ? data.items : [];
  const staticRows = Array.isArray(element.rows) ? element.rows : [];
  const columns = Array.isArray(element.columns) && element.columns.length > 0
    ? element.columns
    : ['name', 'quantity', 'unitPrice', 'total'];
  const labels = {
    name: 'Ürün',
    productName: 'Ürün',
    quantity: 'Adet',
    qty: 'Adet',
    unitPrice: 'Fiyat',
    price: 'Fiyat',
    total: 'Tutar',
    amount: 'Tutar',
  };
  const bodyRows = rows.length > 0
    ? rows.map((row) => columns.map((column) => lookupPath(row, column)))
    : staticRows.map((row) => row.map((cell) => interpolateTemplateText(cell, data)));
  return `
    <table class="rx-table">
      <thead>
        <tr>${columns.map((c) => `<th>${htmlEscape(labels[c] || c)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${htmlEscape(cell)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
}

function renderTemplateElement(element, data) {
  const type = String(element.type || 'text').toLowerCase();
  const borderWidth = mm(element.borderWidth, type === 'box' ? 0.2 : 0);
  const styles = [
    'position:absolute',
    `left:${mm(element.x)}mm`,
    `top:${mm(element.y)}mm`,
    `width:${mm(element.width, 10)}mm`,
    `height:${mm(element.height, 5)}mm`,
    `font-size:${mm(element.fontSize, 10)}pt`,
    `font-weight:${element.fontWeight === 'bold' ? '700' : '400'}`,
    `text-align:${['left', 'center', 'right'].includes(element.textAlign) ? element.textAlign : 'left'}`,
    `color:${cssColor(element.color, '#111')}`,
    `background:${cssColor(element.backgroundColor)}`,
    `border:${borderWidth > 0 ? `${borderWidth}mm solid ${cssColor(element.borderColor, '#111')}` : 'none'}`,
    'box-sizing:border-box',
    'overflow:hidden',
    'padding:0.8mm',
  ];
  const open = `<div class="rx-el rx-${type}" style="${styles.join(';')}">`;
  if (type === 'line') {
    return `<div class="rx-el rx-line" style="position:absolute;left:${mm(element.x)}mm;top:${mm(element.y)}mm;width:${mm(element.width, 10)}mm;height:${Math.max(0.2, mm(element.height, 0.2))}mm;background:${cssColor(element.borderColor || element.color, '#111')};"></div>`;
  }
  if (type === 'table') {
    return `${open}${renderTableElement(element, data)}</div>`;
  }
  if (type === 'image') {
    const src = interpolateTemplateText(firstString(element.content, element.field), data);
    return `${open}${src ? `<img src="${attrEscape(src)}" alt="" />` : ''}</div>`;
  }
  if (type === 'barcode' || type === 'qr') {
    const value = templateElementText(element, data);
    const label = type === 'qr' ? 'QR' : 'CODE128';
    return `${open}<div class="rx-code">${htmlEscape(label)}<br>${htmlEscape(value)}</div></div>`;
  }
  if (type === 'box') {
    return `${open}</div>`;
  }
  return `${open}<span>${htmlEscape(templateElementText(element, data))}</span></div>`;
}

function normalizeTemplateCatalog(content) {
  if (Array.isArray(content)) return content;
  if (content && typeof content === 'object' && Array.isArray(content.templates)) return content.templates;
  return [];
}

async function loadFastReportTemplate(client, firm, templateId) {
  if (!templateId) throw new Error('fastreport_template icin payload.templateId zorunlu.');
  const res = await client.query(
    `SELECT content
       FROM public.report_templates
      WHERE category = $1
        AND template_type = $2
        AND (firm_nr = $3 OR firm_nr IS NULL)
      ORDER BY CASE WHEN firm_nr = $3 THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1`,
    [TEMPLATE_CATALOG_CATEGORY, TEMPLATE_CATALOG_TYPE, firm],
  );
  const templates = normalizeTemplateCatalog(res.rows[0]?.content);
  const template = templates.find((t) => String(t?.id || '') === String(templateId));
  if (!template) throw new Error(`Template bulunamadi: ${templateId}`);
  return template;
}

async function loadFastReportFrxDesign(client, firm, designId) {
  if (!designId) throw new Error('fastreport_frx icin payload.designId zorunlu.');
  const res = await client.query(
    `SELECT id::text, name, content
       FROM public.report_templates
      WHERE id = $1::uuid
        AND (firm_nr = $2 OR firm_nr IS NULL)
        AND (LOWER(template_type) = 'fastreport_frx' OR LOWER(category) = 'fastreport_frx')
      ORDER BY CASE WHEN firm_nr = $2 THEN 0 ELSE 1 END
      LIMIT 1`,
    [designId, firm],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`FastReport .frx dizayni bulunamadi: ${designId}`);
  return row;
}

function extractFrxText(content) {
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object') return '';
  return firstString(
    content.frxXml,
    content.frx_xml,
    content.xml,
    content.text,
    content.content,
    content.template,
  );
}

function renderFastReportTemplateHtml(template, data) {
  const width = mm(template.width, 80);
  const height = mm(template.height, 297);
  const pageTitle = firstString(template.name, 'AsinERP Print');
  const elements = Array.isArray(template.elements) ? template.elements : [];
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${htmlEscape(pageTitle)}</title>
  <style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
    .rx-page { position: relative; width: ${width}mm; min-height: ${height}mm; page-break-after: always; overflow: hidden; }
    .rx-el span { white-space: pre-wrap; word-break: break-word; line-height: 1.15; }
    .rx-el img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .rx-code { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Consolas, "Courier New", monospace; letter-spacing: 0.8px; text-align: center; }
    .rx-table { width: 100%; border-collapse: collapse; font-size: inherit; }
    .rx-table th, .rx-table td { border: 0.1mm solid #999; padding: 0.8mm; vertical-align: top; }
    .rx-table th { background: #f2f2f2; font-weight: 700; }
  </style>
</head>
<body>
  <main class="rx-page">
    ${elements.map((element) => renderTemplateElement(element, data)).join('\n    ')}
  </main>
</body>
</html>`;
}

function findExistingPath(candidates) {
  return candidates.filter(Boolean).find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || '';
}

function findFastReportCliPath(settings = {}) {
  return firstString(
    process.env.FASTREPORT_CLI,
    settings.fastReportCliPath,
    findExistingPath([
      'C:\\Program Files\\FastReport\\FastReport.Cli.exe',
      'C:\\Program Files (x86)\\FastReport\\FastReport.Cli.exe',
      path.join(__dirname, 'FastReport.Cli.exe'),
      path.join(ROOT, 'resources', 'FastReport.Cli.exe'),
    ]),
  );
}

function findBrowserPath(settings = {}) {
  return firstString(
    process.env.PRINT_BROWSER,
    settings.browserPath,
    findExistingPath([
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]),
  );
}

function findSumatraPath(settings = {}) {
  return firstString(
    process.env.SUMATRA_PDF,
    settings.sumatraPath,
    findExistingPath([
      path.join(__dirname, 'SumatraPDF.exe'),
      path.join(__dirname, 'sumatra', 'SumatraPDF.exe'),
      path.join(ROOT, 'resources', 'SumatraPDF.exe'),
      path.join(ROOT, 'resources', 'sumatra', 'SumatraPDF.exe'),
      'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
      'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
    ]),
  );
}

async function writeTempHtml(html) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'retailex-print-'));
  const htmlPath = path.join(dir, 'job.html');
  await fs.promises.writeFile(htmlPath, html, 'utf8');
  return { dir, htmlPath, pdfPath: path.join(dir, 'job.pdf') };
}

async function htmlToPdfWithBrowser(browserPath, htmlPath, pdfPath) {
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
  const args = ['--headless=new', '--disable-gpu', `--print-to-pdf=${pdfPath}`, fileUrl];
  try {
    await execFileAsync(browserPath, args, { windowsHide: true, timeout: 60_000 });
  } catch {
    await execFileAsync(browserPath, ['--headless', '--disable-gpu', `--print-to-pdf=${pdfPath}`, fileUrl], {
      windowsHide: true,
      timeout: 60_000,
    });
  }
  if (!fs.existsSync(pdfPath)) throw new Error('HTML PDF ciktisi olusmadi.');
}

async function powershellStartPrintHtml(htmlPath) {
  const ps = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Start-Process -FilePath '${htmlPath.replace(/'/g, "''")}' -Verb Print -WindowStyle Hidden`,
  ];
  await execFileAsync('powershell.exe', ps, { windowsHide: true, timeout: 30_000 });
}

async function printHtmlDocument(html, printerName, settings = {}) {
  if (!html || typeof html !== 'string') throw new Error('HTML yazdirma icin payload.html zorunlu.');
  if (!IS_WIN) throw new Error('HTML sistem yazdirma yalnizca Windows servis host uzerinde desteklenir.');
  const targetPrinter = firstString(printerName, settings.defaultSystemPrinterName);
  const temp = await writeTempHtml(html);
  const browserPath = findBrowserPath(settings);
  const sumatraPath = findSumatraPath(settings);

  try {
    if (browserPath && sumatraPath && targetPrinter) {
      await htmlToPdfWithBrowser(browserPath, temp.htmlPath, temp.pdfPath);
      await execFileAsync(sumatraPath, ['-print-to', targetPrinter, '-silent', temp.pdfPath], {
        windowsHide: true,
        timeout: 60_000,
      });
      return `system:${targetPrinter} HTML->PDF->Sumatra`;
    }
    if (browserPath && !sumatraPath && targetPrinter) {
      throw new Error(`SumatraPDF bulunamadi; ${targetPrinter} yazicisina sessiz PDF yazdirma yapilamiyor.`);
    }
    await powershellStartPrintHtml(temp.htmlPath);
    return `system:${targetPrinter || 'varsayilan'} HTML Start-Process best-effort`;
  } finally {
    setTimeout(() => fs.rm(temp.dir, { recursive: true, force: true }, () => {}), 30_000).unref();
  }
}

async function printFastReportFrx(job, context) {
  if (!IS_WIN) throw new Error('FastReport runtime kurulmalı');
  const designId = firstString(job.payload.designId, job.payload.design_id);
  const design = await loadFastReportFrxDesign(context.client, context.firm, designId);
  const frxText = extractFrxText(design.content);
  if (!frxText) throw new Error('FastReport .frx içeriği report_templates.content içinde bulunamadı.');

  const cliPath = findFastReportCliPath(context.settings);
  if (!cliPath) throw new Error('FastReport runtime kurulmalı');

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'retailex-frx-'));
  const frxPath = path.join(dir, 'design.frx');
  const dataPath = path.join(dir, 'data.json');
  const targetPrinter = firstString(job.systemName, context.settings.defaultSystemPrinterName);
  await fs.promises.writeFile(frxPath, frxText, 'utf8');
  await fs.promises.writeFile(dataPath, JSON.stringify(firstObject(job.payload.data), null, 2), 'utf8');
  const args = ['print', '--template', frxPath, '--data', dataPath];
  if (targetPrinter) args.push('--printer', targetPrinter);
  try {
    await execFileAsync(cliPath, args, { windowsHide: true, timeout: 120_000 });
    return `fastreport_frx:${designId} -> ${targetPrinter || 'varsayilan'}`;
  } finally {
    setTimeout(() => fs.rm(dir, { recursive: true, force: true }, () => {}), 30_000).unref();
  }
}

function buildTestPageEscPos(job) {
  const text = [
    esc(0x1b, 0x40),
    esc(0x1b, 0x61, 1),
    esc(0x1b, 0x21, 0x30),
    enc('AsinERP Printer\n'),
    esc(0x1b, 0x21, 0),
    enc('Test Page\n'),
    enc(new Date().toLocaleString('tr-TR')),
    enc('\n\n'),
    enc(`Target: ${job.address || job.systemName || 'default'}\n\n\n`),
    esc(0x1d, 0x56, 0x00),
  ];
  return Buffer.concat(text);
}

function buildTestPageHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>AsinERP Printer Test</title>
<style>@page{margin:10mm}body{font-family:Arial,sans-serif}.box{border:1px solid #111;padding:12mm}</style></head>
<body><div class="box"><h1>AsinERP Printer</h1><p>Test Page</p><p>${htmlEscape(new Date().toLocaleString('tr-TR'))}</p></div></body></html>`;
}

async function printJob(row, context) {
  const job = normalizeJob(row, context);
  const jobType = job.jobType || LEGACY_JOB_TYPE;
  if (jobType === LEGACY_JOB_TYPE || job.payload?.kind === LEGACY_JOB_TYPE) {
    if (job.connection && job.connection !== 'network') {
      throw new Error(`Mutfak fisi ESC/POS icin network baglanti gerekir: ${job.connection || 'bos'}`);
    }
    if (!job.address) throw new Error('Ag yazicisi adresi yok.');
    const payload = buildKitchenTicketEscPos(job);
    await sendEscPosTcp(job.address, job.port, payload);
    return `${job.address}:${job.port} kitchen_ticket (${payload.length} bayt)`;
  }

  if (jobType === 'escpos_raw' || job.payload?.escposBase64) {
    const base64 = firstString(job.payload?.escposBase64, job.payload?.escpos_b64, job.payload?.dataB64, job.payload?.data_b64);
    if (!base64) throw new Error('escpos_raw icin payload.escposBase64 zorunlu.');
    if (!job.address) throw new Error('ESC/POS raw icin ag yazicisi adresi yok.');
    const payload = Buffer.from(base64, 'base64');
    await sendEscPosTcp(job.address, job.port, payload);
    return `${job.address}:${job.port} escpos_raw (${payload.length} bayt)`;
  }

  if (HTML_JOB_TYPES.has(jobType)) {
    if (job.connection === 'network' && !job.systemName) {
      throw new Error('HTML belge raw ESC/POS ag portuna gonderilemez; system yazici/printer_name gerekli.');
    }
    const info = await printHtmlDocument(job.payload.html, job.systemName, context.settings);
    return `${jobType} -> ${info}`;
  }

  if (jobType === 'fastreport_template') {
    const templateId = firstString(job.payload.templateId, job.payload.template_id);
    const data = firstObject(job.payload.data);
    const template = await loadFastReportTemplate(context.client, context.firm, templateId);
    const html = renderFastReportTemplateHtml(template, data);
    if (job.connection === 'network' && !job.systemName) {
      throw new Error('FastReport-like HTML raw ESC/POS ag portuna gonderilemez; system yazici/printer_name gerekli.');
    }
    const info = await printHtmlDocument(html, job.systemName, context.settings);
    return `fastreport_template:${templateId} -> ${info}`;
  }

  if (jobType === 'fastreport_frx' || job.payload?.kind === 'fastreport_frx') {
    return await printFastReportFrx(job, context);
  }

  if (jobType === 'test_page') {
    if (job.connection === 'network' || job.address) {
      if (!job.address) throw new Error('Network test sayfasi icin ag yazicisi adresi gerekli.');
      const payload = buildTestPageEscPos(job);
      await sendEscPosTcp(job.address, job.port, payload);
      return `${job.address}:${job.port} test_page (${payload.length} bayt)`;
    }
    if (job.connection === 'system' || job.systemName) {
      const info = await printHtmlDocument(buildTestPageHtml(), job.systemName, context.settings);
      return `test_page -> ${info}`;
    }
    throw new Error('Test sayfasi icin ag yazicisi adresi veya system yazici gerekli.');
  }

  throw new Error(`Desteklenmeyen print job tipi: ${jobType}`);
}

async function pollTargetTable(client, target, tableDef, context) {
  const info = await tableInfo(client, tableDef.tableName);
  if (!info.exists) {
    logLine(`${target.name}: rest.${tableDef.tableName} yok, atlandi.`);
    return;
  }
  const jobs = await claimJobs(client, info, tableDef.legacy);
  if (jobs.length > 0) logLine(`${target.name}: ${jobs.length} print job alindi (${info.tableName}).`);
  for (const row of jobs) {
    try {
      const infoText = await printJob(row, { ...context, legacy: tableDef.legacy });
      await markPrinted(client, info, row.id);
      logLine(`${target.name}: ${info.tableName} job ${row.id} printed -> ${infoText}`);
    } catch (e) {
      await markFailed(client, info, row.id, e).catch((markErr) => {
        logLine(`${target.name}: ${info.tableName} job ${row.id} failed, durum yazilamadi: ${markErr?.message || markErr}`);
      });
      logLine(`${target.name}: ${info.tableName} job ${row.id} failed: ${e?.message || e}`);
    }
  }
}

async function pollTarget(target, firm, tables) {
  await withClient(target, async (client) => {
    const settings = await loadPrinterServiceSettings(client, firm);
    for (const tableDef of tables) {
      await pollTargetTable(client, target, tableDef, { client, firm, settings });
    }
  });
}

async function pollOnce() {
  const configWrap = await loadConfigDb();
  const { firm, period, tables } = resolveFirmPeriod(configWrap);
  const targets = resolveTargets(configWrap);
  if (targets.length === 0) {
    logLine('PostgreSQL hedefi yok: config.db veya PGHOST/PGDATABASE ayarlari bulunamadi.');
    return;
  }
  logLine(`Poll: firma=${firm}, donem=${period}, hedef=${targets.map((t) => `${t.name}:${t.host}/${t.database}`).join(', ')}`);
  for (const target of targets) {
    try {
      await pollTarget(target, firm, tables);
    } catch (e) {
      logLine(`${target.name}: PG erisim/poll hatasi: ${e?.message || e}`);
    }
  }
}

function printHelp() {
  const text = `AsinERP Printer Service (unified) - kitchen-print-service

Kullanım:
  node scripts/kitchen-print-service.mjs [--once] [--help]

Seçenekler:
  --once     Tek poll turu çalıştırıp çık
  --help     Bu yardımı göster

Ortam:
  CONFIG_DB, PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
  PRINT_FIRM_NR, PRINT_PERIOD_NR, PRINT_POLL_MS

Kuyruklar:
  rest.rex_{firm}_{period}_print_jobs
  rest.rex_{firm}_{period}_kitchen_print_jobs (legacy)

Job tipleri:
  kitchen_ticket, escpos_raw, html_document, pos_receipt_80, account_receipt
  invoice_a4, report_html, product_label, fastreport_template, fastreport_frx, test_page

Windows hizmeti: AsinERP_Printer.exe
Ayrıntı: DeskApp/resources/README_PRINTER_SERVICE.md
`;
  console.log(text);
}

async function main() {
  if (SHOW_HELP) {
    printHelp();
    return;
  }
  logLine(`AsinERP Printer worker started. worker=${WORKER_ID}, poll=${POLL_MS}ms`);
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

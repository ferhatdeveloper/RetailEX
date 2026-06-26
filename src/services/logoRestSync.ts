/**
 * Logo Tiger REST → RetailEX veri senkronizasyonu
 */

import {
  ensureLogoBridgeReachable,
  logoEnsureSession,
  logoFetchAllPaginated,
  logoListResource,
  resolveLogoContext,
  type LogoRestConfig,
} from './logoRestApi';
import { productAPI } from './api/products';
import { customerAPI } from './api/customers';
import { supplierAPI } from './api/suppliers';
import { DB_SETTINGS, ERP_SETTINGS, postgres } from './postgres';

export type LogoSyncLogEntry = {
  at: string;
  entity: 'product' | 'customer' | 'supplier' | 'invoice' | 'system';
  action: 'read' | 'create' | 'update' | 'skip' | 'error';
  code: string;
  name?: string;
  detail?: string;
  ok: boolean;
};

export type LogoSyncProgress = {
  phase: 'prepare' | 'products' | 'customers' | 'suppliers' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
  lastLog?: LogoSyncLogEntry;
};

export type LogoSyncEntityResult = {
  fetched: number;
  upserted: number;
  errors: number;
  skipped: number;
};

export type LogoSyncOptions = {
  products?: boolean;
  customers?: boolean;
  suppliers?: boolean;
  pageSize?: number;
  maxPages?: number;
  onLog?: (entry: LogoSyncLogEntry) => void;
};

export type LogoSyncResult = {
  ok: boolean;
  products: LogoSyncEntityResult;
  customers: LogoSyncEntityResult;
  suppliers: LogoSyncEntityResult;
  messages: string[];
  error?: string;
};

const LOG_EVERY = 10;
const REST_UPSERT_CHUNK = 80;

function isRestApiMode(): boolean {
  return DB_SETTINGS.connectionProvider === 'rest_api';
}

async function bulkUpsertTableRest(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<void> {
  const { postgrest } = await import('./api/postgrestClient');
  for (let i = 0; i < rows.length; i += REST_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + REST_UPSERT_CHUNK);
    await postgrest.upsert(`/${table}`, chunk, onConflict, { schema: 'public' });
  }
}

function firmNrPadded(): string {
  const raw = String(ERP_SETTINGS.firmNr || '001').replace(/\D/g, '') || '1';
  return raw.padStart(3, '0');
}

function trunc(s: unknown, max: number): string {
  return String(s ?? '').trim().slice(0, max);
}

function numVal(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function nowLog(
  onLog: LogoSyncOptions['onLog'],
  entry: Omit<LogoSyncLogEntry, 'at'>
): LogoSyncLogEntry {
  const full: LogoSyncLogEntry = { ...entry, at: new Date().toISOString() };
  onLog?.(full);
  return full;
}

function unwrapLogoRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const inner = o.restRecord ?? o.RestRecord ?? o.record ?? o.Item ?? o.item;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return o;
}

function logoField(rec: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  const lowerKeys = new Set(keys.map((k) => k.toLowerCase()));
  for (const [rk, rv] of Object.entries(rec)) {
    if (lowerKeys.has(rk.toLowerCase()) && rv !== undefined && rv !== null && rv !== '') {
      return rv;
    }
  }
  return undefined;
}

/** Logo REST: CARDTYPE yok; ACCOUNT_TYPE kullanılır */
function resolveArpRoles(rec: Record<string, unknown>): { customer: boolean; supplier: boolean } {
  const cardType = Math.round(numVal(logoField(rec, 'CARDTYPE', 'CARD_TYPE', 'cardType'), -1));
  if (cardType === 1) return { customer: true, supplier: false };
  if (cardType === 2) return { customer: false, supplier: true };
  if (cardType === 3) return { customer: true, supplier: true };

  const accountType = Math.round(numVal(logoField(rec, 'ACCOUNT_TYPE', 'accountType'), -1));
  // Logo REST örnekleri: 3=müşteri/tedarikçi, 22=özel kart
  if (accountType === 1) return { customer: false, supplier: true };
  if (accountType === 2) return { customer: true, supplier: false };
  if (accountType === 3 || accountType === 22) return { customer: true, supplier: true };
  if (accountType <= 0) return { customer: true, supplier: false };
  return { customer: true, supplier: accountType === 4 };
}

async function ensureFirmTables(firmNr: string): Promise<void> {
  // SaaS rest_api: tablolar sunucu migration ile hazır; köprüye 127.0.0.1 connStr göndermek ECONNREFUSED üretir.
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    return;
  }
  await postgres.query('SELECT public.CREATE_FIRM_TABLES($1::varchar)', [firmNr]);
}

async function findCustomerByCode(code: string): Promise<{ id: string } | null> {
  const table = `rex_${ERP_SETTINGS.firmNr}_customers`;
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<{ id: string }[]>(
      `/${table}`,
      { select: 'id', code: `eq.${code}`, firm_nr: `eq.${ERP_SETTINGS.firmNr}`, limit: 1 },
      { schema: 'public' }
    );
    return Array.isArray(rows) && rows[0]?.id ? rows[0] : null;
  }
  const { rows } = await postgres.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE code = $1 AND firm_nr = $2 LIMIT 1`,
    [code, ERP_SETTINGS.firmNr]
  );
  return rows[0] ?? null;
}

function mapLogoItem(rec: Record<string, unknown>, firmNr: string): Record<string, unknown> | null {
  const code = trunc(logoField(rec, 'CODE', 'code'), 100);
  if (!code) return null;

  const name = trunc(logoField(rec, 'NAME', 'name', 'DESCRIPTION', 'description'), 255) || 'İsimsiz';
  const barcode = trunc(logoField(rec, 'BARCODE', 'barcode'), 100);
  const vat = numVal(logoField(rec, 'VAT', 'SELLVAT', 'vat', 'sellvat'), 18);
  const price = numVal(logoField(rec, 'PRICE', 'SELLPRICE', 'price', 'sellprice'), 0);
  const unit = trunc(logoField(rec, 'UNIT', 'unit'), 50) || 'Adet';
  const cancelled = numVal(logoField(rec, 'CANCELLED', 'cancelled'), 0);
  const activeFlag = numVal(logoField(rec, 'ACTIVE', 'active'), 0);
  const isActive = cancelled !== 1 && activeFlag !== 1;

  return {
    firm_nr: firmNr,
    code,
    name,
    barcode: barcode || `L${code}`.slice(0, 100),
    vat_rate: vat,
    unit,
    price,
    is_active: isActive,
  };
}

function mapLogoArp(rec: Record<string, unknown>, firmNr: string): Record<string, unknown> | null {
  const code = trunc(logoField(rec, 'CODE', 'code'), 50);
  if (!code) return null;

  const name =
    trunc(logoField(rec, 'TITLE', 'DEFINITION_', 'NAME', 'title', 'definition', 'name'), 255) || 'İsimsiz';

  return {
    firm_nr: firmNr,
    code,
    name,
    phone: trunc(logoField(rec, 'TELNRS', 'TELNRS2', 'PHONE', 'phone'), 50),
    email: trunc(logoField(rec, 'EMAILADDR', 'EMAIL', 'email'), 255),
    tax_nr: trunc(logoField(rec, 'TAXNR', 'TAX_ID', 'taxnr'), 50),
    tax_office: trunc(logoField(rec, 'TAXOFFICE', 'taxoffice'), 100),
    address: trunc(logoField(rec, 'ADDR1', 'ADDRESS', 'addr1', 'address'), 2000),
    city: trunc(logoField(rec, 'CITY', 'city'), 100),
    is_active: true,
  };
}

async function upsertProductsWithApi(
  rows: Record<string, unknown>[],
  onLog?: LogoSyncOptions['onLog'],
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncEntityResult> {
  const total = rows.length;

  if (isRestApiMode() && total > 0) {
    const table = `rex_${firmNrPadded()}_products`;
    const firmEq = firmNrPadded();
    const payloads = rows.map((row) => ({
      firm_nr: firmEq,
      code: String(row.code || ''),
      name: String(row.name || 'İsimsiz'),
      barcode: String(row.barcode || `L${row.code}`).slice(0, 100),
      vat_rate: numVal(row.vat_rate, 18),
      price: numVal(row.price, 0),
      unit: String(row.unit || 'Adet'),
      is_active: row.is_active !== false,
      updated_at: new Date().toISOString(),
    }));

    try {
      onProgress?.({
        phase: 'products',
        message: `${total} ürün toplu yazılıyor…`,
        current: 0,
        total,
      });
      await bulkUpsertTableRest(table, payloads, 'firm_nr,code');
      nowLog(onLog, {
        entity: 'product',
        action: 'update',
        code: '*',
        detail: `${total} ürün toplu upsert`,
        ok: true,
      });
      onProgress?.({
        phase: 'products',
        message: `Ürünler: ${total}/${total}`,
        current: total,
        total,
      });
      return { fetched: total, upserted: total, errors: 0, skipped: 0 };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      nowLog(onLog, { entity: 'product', action: 'error', code: '*', detail: msg, ok: false });
      throw new Error(`Ürün toplu yazımı başarısız: ${msg}`);
    }
  }

  let upserted = 0;
  let errors = 0;
  let skipped = 0;
  let firstError = '';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row.code || '');
    const name = String(row.name || '');

    try {
      const existing = await productAPI.getByCode(code);
      if (existing?.id) {
        await productAPI.update(existing.id, {
          name,
          barcode: String(row.barcode || ''),
          taxRate: numVal(row.vat_rate, 18),
          price: numVal(row.price, 0),
          unit: String(row.unit || 'Adet'),
          isActive: row.is_active !== false,
        } as never);
        upserted += 1;
        if (i % LOG_EVERY === 0 || i === total - 1) {
          const lastLog = nowLog(onLog, {
            entity: 'product',
            action: 'update',
            code,
            name,
            ok: true,
          });
          onProgress?.({
            phase: 'products',
            message: `Ürünler: ${upserted}/${total}`,
            current: upserted,
            total,
            lastLog,
          });
        }
      } else {
        await productAPI.create({
          code,
          name,
          barcode: String(row.barcode || `L${code}`).slice(0, 100),
          taxRate: numVal(row.vat_rate, 18),
          price: numVal(row.price, 0),
          unit: String(row.unit || 'Adet'),
          stock: 0,
          cost: 0,
          firm_nr: ERP_SETTINGS.firmNr,
          isActive: row.is_active !== false,
        } as never);
        upserted += 1;
        if (i % LOG_EVERY === 0 || i === total - 1) {
          const lastLog = nowLog(onLog, {
            entity: 'product',
            action: 'create',
            code,
            name,
            ok: true,
          });
          onProgress?.({
            phase: 'products',
            message: `Ürünler: ${upserted}/${total}`,
            current: upserted,
            total,
            lastLog,
          });
        }
      }
    } catch (e: unknown) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (!firstError) firstError = `${code}: ${msg}`;
      nowLog(onLog, {
        entity: 'product',
        action: 'error',
        code,
        name,
        detail: msg,
        ok: false,
      });
    }
  }

  if (firstError && errors === total) {
    throw new Error(`Ürün yazımı tamamen başarısız. İlk hata: ${firstError}`);
  }

  return { fetched: total, upserted, errors, skipped };
}

async function upsertCustomersWithApi(
  rows: Record<string, unknown>[],
  onLog?: LogoSyncOptions['onLog'],
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncEntityResult> {
  const total = rows.length;

  if (isRestApiMode() && total > 0) {
    const table = `rex_${firmNrPadded()}_customers`;
    const firmEq = firmNrPadded();
    const payloads = rows.map((row) => ({
      firm_nr: firmEq,
      code: String(row.code || ''),
      name: String(row.name || 'İsimsiz'),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      address: String(row.address || ''),
      city: String(row.city || ''),
      tax_nr: String(row.tax_nr || ''),
      tax_office: String(row.tax_office || ''),
      is_active: true,
    }));

    try {
      onProgress?.({
        phase: 'customers',
        message: `${total} cari toplu yazılıyor…`,
        current: 0,
        total,
      });
      await bulkUpsertTableRest(table, payloads, 'code');
      return { fetched: total, upserted: total, errors: 0, skipped: 0 };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      nowLog(onLog, { entity: 'customer', action: 'error', code: '*', detail: msg, ok: false });
      throw new Error(`Cari toplu yazımı başarısız: ${msg}`);
    }
  }

  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row.code || '');
    const name = String(row.name || '');
    try {
      const existing = await findCustomerByCode(code);
      if (existing?.id) {
        await customerAPI.update(existing.id, {
          name,
          phone: String(row.phone || ''),
          email: String(row.email || ''),
          address: String(row.address || ''),
          city: String(row.city || ''),
          taxNumber: String(row.tax_nr || ''),
          taxOffice: String(row.tax_office || ''),
        } as never);
        upserted += 1;
        if (i % LOG_EVERY === 0 || i === total - 1) {
          const lastLog = nowLog(onLog, { entity: 'customer', action: 'update', code, name, ok: true });
          onProgress?.({
            phase: 'customers',
            message: `Cariler: ${upserted}/${total}`,
            current: upserted,
            total,
            lastLog,
          });
        }
      } else {
        await customerAPI.create({
          code,
          name,
          phone: String(row.phone || ''),
          email: String(row.email || ''),
          address: String(row.address || ''),
          city: String(row.city || ''),
          taxNumber: String(row.tax_nr || ''),
          taxOffice: String(row.tax_office || ''),
          firm_nr: ERP_SETTINGS.firmNr,
        } as never);
        upserted += 1;
        if (i % LOG_EVERY === 0 || i === total - 1) {
          const lastLog = nowLog(onLog, { entity: 'customer', action: 'create', code, name, ok: true });
          onProgress?.({
            phase: 'customers',
            message: `Cariler: ${upserted}/${total}`,
            current: upserted,
            total,
            lastLog,
          });
        }
      }
    } catch (e: unknown) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      nowLog(onLog, { entity: 'customer', action: 'error', code, name, detail: msg, ok: false });
    }
  }

  return { fetched: total, upserted, errors, skipped: 0 };
}

async function upsertSuppliersWithApi(
  rows: Record<string, unknown>[],
  onLog?: LogoSyncOptions['onLog'],
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncEntityResult> {
  const total = rows.length;

  if (isRestApiMode() && total > 0) {
    const table = `rex_${firmNrPadded()}_suppliers`;
    const firmEq = firmNrPadded();
    const payloads = rows.map((row) => ({
      firm_nr: firmEq,
      code: String(row.code || ''),
      name: String(row.name || 'İsimsiz'),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      address: String(row.address || ''),
      city: String(row.city || ''),
      tax_nr: String(row.tax_nr || ''),
      tax_office: String(row.tax_office || ''),
      is_active: true,
    }));

    try {
      onProgress?.({
        phase: 'suppliers',
        message: `${total} tedarikçi toplu yazılıyor…`,
        current: 0,
        total,
      });
      await bulkUpsertTableRest(table, payloads, 'code');
      return { fetched: total, upserted: total, errors: 0, skipped: 0 };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      nowLog(onLog, { entity: 'supplier', action: 'error', code: '*', detail: msg, ok: false });
      throw new Error(`Tedarikçi toplu yazımı başarısız: ${msg}`);
    }
  }

  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row.code || '');
    const name = String(row.name || '');
    try {
      const existing = await supplierAPI.getByCode(code);
      if (existing?.id) {
        await supplierAPI.update(existing.id, {
          name,
          phone: String(row.phone || ''),
          email: String(row.email || ''),
          address: String(row.address || ''),
          city: String(row.city || ''),
          tax_number: String(row.tax_nr || ''),
          tax_office: String(row.tax_office || ''),
        } as never);
      } else {
        await supplierAPI.create({
          code,
          name,
          phone: String(row.phone || ''),
          email: String(row.email || ''),
          address: String(row.address || ''),
          city: String(row.city || ''),
          tax_number: String(row.tax_nr || ''),
          tax_office: String(row.tax_office || ''),
          cardType: 'supplier',
          firm_nr: ERP_SETTINGS.firmNr,
        } as never);
      }
      upserted += 1;
      if (i % LOG_EVERY === 0 || i === total - 1) {
        const lastLog = nowLog(onLog, { entity: 'supplier', action: 'update', code, name, ok: true });
        onProgress?.({
          phase: 'suppliers',
          message: `Tedarikçiler: ${upserted}/${total}`,
          current: upserted,
          total,
          lastLog,
        });
      }
    } catch (e: unknown) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      nowLog(onLog, { entity: 'supplier', action: 'error', code, name, detail: msg, ok: false });
    }
  }

  return { fetched: total, upserted, errors, skipped: 0 };
}

export async function syncLogoProductsFromRest(
  cfg: LogoRestConfig,
  options: Pick<LogoSyncOptions, 'onLog'> = {},
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncEntityResult> {
  const firmNr = firmNrPadded();

  onProgress?.({ phase: 'products', message: 'Logo stok kartları okunuyor…', current: 0 });
  nowLog(options.onLog, { entity: 'system', action: 'read', code: 'items', detail: 'Logo /items okunuyor', ok: true });

  await logoListResource(cfg, 'items', { limit: 1, withCount: true });

  const rawItems = await logoFetchAllPaginated<unknown>(cfg, 'items', { maxPages: 500, pageSize: 15 });
  const rows: Record<string, unknown>[] = [];
  for (const raw of rawItems) {
    const mapped = mapLogoItem(unwrapLogoRecord(raw), firmNr);
    if (mapped) rows.push(mapped);
  }

  onProgress?.({
    phase: 'products',
    message: `${rows.length} ürün RetailEX'e yazılıyor…`,
    current: 0,
    total: rows.length,
  });

  const result = await upsertProductsWithApi(rows, options.onLog, onProgress);

  onProgress?.({
    phase: 'products',
    message: `Ürünler: ${result.upserted} OK, ${result.errors} hata`,
    current: result.upserted,
    total: rows.length,
  });

  return { ...result, fetched: rawItems.length };
}

export async function syncLogoArpsFromRest(
  cfg: LogoRestConfig,
  opts: { customers: boolean; suppliers: boolean; onLog?: LogoSyncOptions['onLog'] },
  onProgress?: (p: LogoSyncProgress) => void
): Promise<{ customers: LogoSyncEntityResult; suppliers: LogoSyncEntityResult }> {
  const firmNr = firmNrPadded();
  const empty: LogoSyncEntityResult = { fetched: 0, upserted: 0, errors: 0, skipped: 0 };

  if (!opts.customers && !opts.suppliers) {
    return { customers: empty, suppliers: empty };
  }

  onProgress?.({ phase: 'customers', message: 'Logo cari hesaplar okunuyor…' });
  const rawArps = await logoFetchAllPaginated<unknown>(cfg, 'Arps', { maxPages: 500, pageSize: 10 });

  const customerRows: Record<string, unknown>[] = [];
  const supplierRows: Record<string, unknown>[] = [];

  for (const raw of rawArps) {
    const rec = unwrapLogoRecord(raw);
    const roles = resolveArpRoles(rec);
    const mapped = mapLogoArp(rec, firmNr);
    if (!mapped) continue;
    if (opts.customers && roles.customer) customerRows.push(mapped);
    if (opts.suppliers && roles.supplier) supplierRows.push({ ...mapped });
  }

  let customerResult = empty;
  let supplierResult = empty;

  if (opts.customers && customerRows.length > 0) {
    customerResult = await upsertCustomersWithApi(customerRows, opts.onLog, onProgress);
  } else if (opts.customers) {
    nowLog(opts.onLog, {
      entity: 'customer',
      action: 'skip',
      code: '-',
      detail: `${rawArps.length} Arps kaydından cari eşleşmedi`,
      ok: true,
    });
  }

  if (opts.suppliers && supplierRows.length > 0) {
    supplierResult = await upsertSuppliersWithApi(supplierRows, opts.onLog, onProgress);
  }

  return { customers: customerResult, suppliers: supplierResult };
}

export async function syncLogoAllFromRest(
  cfg: LogoRestConfig,
  options: LogoSyncOptions = {},
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncResult> {
  const messages: string[] = [];
  const result: LogoSyncResult = {
    ok: false,
    products: { fetched: 0, upserted: 0, errors: 0, skipped: 0 },
    customers: { fetched: 0, upserted: 0, errors: 0, skipped: 0 },
    suppliers: { fetched: 0, upserted: 0, errors: 0, skipped: 0 },
    messages,
  };

  const syncProducts = options.products !== false;
  const syncCustomers = options.customers !== false;
  const syncSuppliers = options.suppliers !== false;

  try {
    onProgress?.({ phase: 'prepare', message: 'Köprü bağlantısı kontrol ediliyor…' });
    await ensureLogoBridgeReachable();
    nowLog(options.onLog, {
      entity: 'system',
      action: 'read',
      code: 'bridge',
      detail: 'pg_bridge erişilebilir',
      ok: true,
    });

    onProgress?.({ phase: 'prepare', message: 'Logo oturumu kontrol ediliyor…' });
    await logoEnsureSession(cfg);
    const ctx = resolveLogoContext(cfg);
    const firmNr = firmNrPadded();

    messages.push(`Senkron: Logo ${ctx.firmNr}/${ctx.periodNr} → RetailEX ${firmNr}`);
    onProgress?.({ phase: 'prepare', message: `Tablolar hazırlanıyor (rex_${firmNr}_*)…` });
    await ensureFirmTables(firmNr);
    messages.push(`Tablolar hazır: rex_${firmNr}_products, rex_${firmNr}_customers`);

    if (syncProducts) {
      result.products = await syncLogoProductsFromRest(cfg, options, onProgress);
      messages.push(
        `Ürünler: ${result.products.upserted}/${result.products.fetched} aktarıldı (${result.products.errors} hata)`
      );
    }

    if (syncCustomers || syncSuppliers) {
      const arp = await syncLogoArpsFromRest(
        cfg,
        { customers: syncCustomers, suppliers: syncSuppliers, onLog: options.onLog },
        onProgress
      );
      result.customers = arp.customers;
      result.suppliers = arp.suppliers;
      if (syncCustomers) {
        messages.push(
          `Cariler: ${result.customers.upserted}/${result.customers.fetched} aktarıldı (${result.customers.errors} hata)`
        );
      }
      if (syncSuppliers) {
        messages.push(
          `Tedarikçiler: ${result.suppliers.upserted}/${result.suppliers.fetched} aktarıldı (${result.suppliers.errors} hata)`
        );
      }
    }

    const failedProducts = syncProducts && result.products.fetched > 0 && result.products.upserted === 0;
    const failedCustomers =
      syncCustomers && result.customers.fetched > 0 && result.customers.upserted === 0;
    result.ok = !failedProducts && !failedCustomers;

    if (!result.ok) {
      result.error = 'Kayıtlar okundu ancak RetailEX\'e yazılamadı. Canlı logdaki hata satırlarına bakın.';
      onProgress?.({ phase: 'error', message: result.error });
    } else {
      onProgress?.({ phase: 'done', message: 'Logo → RetailEX senkronizasyonu tamamlandı.' });
      messages.push('Senkronizasyon tamamlandı.');
    }

    return result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.error = msg;
    messages.push(`Hata: ${msg}`);
    onProgress?.({ phase: 'error', message: msg });
    nowLog(options.onLog, { entity: 'system', action: 'error', code: 'sync', detail: msg, ok: false });
    return result;
  }
}

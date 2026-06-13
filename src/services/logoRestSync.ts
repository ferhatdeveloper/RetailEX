/**
 * Logo Tiger REST → RetailEX veri senkronizasyonu
 * MSSQL sync_logo_data (DeskApp/mssql.rs) ile aynı hedef tablolar:
 *   /items  → rex_{firm}_products
 *   /Arps   → rex_{firm}_customers / rex_{firm}_suppliers (CARDTYPE)
 */

import {
  logoEnsureSession,
  logoFetchAllPaginated,
  resolveLogoContext,
  type LogoRestConfig,
} from './logoRestApi';
import { DB_SETTINGS, ERP_SETTINGS, postgres } from './postgres';

export type LogoSyncProgress = {
  phase: 'prepare' | 'products' | 'customers' | 'suppliers' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
};

export type LogoSyncEntityResult = {
  fetched: number;
  upserted: number;
  errors: number;
};

export type LogoSyncOptions = {
  products?: boolean;
  customers?: boolean;
  suppliers?: boolean;
  pageSize?: number;
  maxPages?: number;
};

export type LogoSyncResult = {
  ok: boolean;
  products: LogoSyncEntityResult;
  customers: LogoSyncEntityResult;
  suppliers: LogoSyncEntityResult;
  messages: string[];
  error?: string;
};

const BATCH_SIZE = 50;

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

function arpCardType(rec: Record<string, unknown>): number {
  const v = logoField(rec, 'CARDTYPE', 'CARD_TYPE', 'cardType', 'cardtype');
  return Math.round(numVal(v, 0));
}

function isCustomerCard(cardType: number): boolean {
  return cardType === 1 || cardType === 3;
}

function isSupplierCard(cardType: number): boolean {
  return cardType === 2 || cardType === 3;
}

async function ensureFirmTables(firmNr: string): Promise<void> {
  await postgres.query('SELECT public.CREATE_FIRM_TABLES($1)', [firmNr]);
}

async function upsertRowsSql(
  table: string,
  rows: Record<string, unknown>[],
  conflictCol: string,
  updateCols: string[]
): Promise<{ upserted: number; errors: number }> {
  if (rows.length === 0) return { upserted: 0, errors: 0 };

  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => row[c]);
      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
      const setClause = updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      const sql = `
        INSERT INTO ${table} (${cols.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (${conflictCol}) DO UPDATE SET ${setClause}
      `;
      try {
        await postgres.query(sql, vals);
        upserted += 1;
      } catch (e) {
        errors += 1;
        console.warn(`[LogoRestSync] SQL upsert hata (${table}):`, e);
      }
    }
  }

  return { upserted, errors };
}

async function upsertRowsPostgrest(
  table: string,
  rows: Record<string, unknown>[],
  conflictCol: string
): Promise<{ upserted: number; errors: number }> {
  if (rows.length === 0) return { upserted: 0, errors: 0 };

  const { getPostgrestUrl } = await import('../config/postgrest.config');
  const { fetchRetailexAware } = await import('../utils/retailexDevProxy');
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetchRetailexAware(getPostgrestUrl(`/${table}`), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Profile': 'public',
          'Content-Profile': 'public',
          Prefer: 'resolution=merge-duplicates,return=minimal',
          'On-Conflict': conflictCol,
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text.slice(0, 200)}`);
      }
      upserted += batch.length;
    } catch (e) {
      errors += batch.length;
      console.warn(`[LogoRestSync] PostgREST upsert hata (${table}):`, e);
    }
  }

  return { upserted, errors };
}

async function upsertRows(
  table: string,
  rows: Record<string, unknown>[],
  conflictCol: string,
  updateCols: string[]
): Promise<{ upserted: number; errors: number }> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    return upsertRowsPostgrest(table, rows, conflictCol);
  }
  return upsertRowsSql(table, rows, conflictCol, updateCols);
}

function mapLogoItem(rec: Record<string, unknown>, firmNr: string): Record<string, unknown> | null {
  const code = trunc(logoField(rec, 'CODE', 'code'), 100);
  if (!code) return null;

  const name = trunc(logoField(rec, 'NAME', 'name', 'DESCRIPTION', 'description'), 255) || 'İsimsiz';
  const refId = Math.round(numVal(logoField(rec, 'INTERNAL_REFERENCE', 'LOGICALREF', 'internalReference'), 0));
  const barcode = trunc(logoField(rec, 'BARCODE', 'barcode'), 100);
  const vat = numVal(logoField(rec, 'VAT', 'SELLVAT', 'vat', 'sellvat'), 18);
  const price = numVal(logoField(rec, 'PRICE', 'SELLPRICE', 'price', 'sellprice'), 0);
  const unit = trunc(logoField(rec, 'UNIT', 'unit'), 50) || 'Adet';
  const cancelled = numVal(logoField(rec, 'CANCELLED', 'cancelled'), 0);
  const activeFlag = numVal(logoField(rec, 'ACTIVE', 'active'), 0);
  const isActive = cancelled !== 1 && activeFlag !== 1;

  const row: Record<string, unknown> = {
    firm_nr: firmNr,
    code,
    name,
    vat_rate: vat,
    unit,
    price,
    is_active: isActive,
  };
  if (refId > 0) row.ref_id = refId;
  if (barcode) row.barcode = barcode;

  return row;
}

function mapLogoCustomer(rec: Record<string, unknown>, firmNr: string): Record<string, unknown> | null {
  const code = trunc(logoField(rec, 'CODE', 'code'), 50);
  if (!code) return null;

  const name =
    trunc(logoField(rec, 'TITLE', 'DEFINITION_', 'NAME', 'title', 'definition', 'name'), 255) || 'İsimsiz';
  const phone = trunc(logoField(rec, 'TELNRS', 'TELNRS2', 'PHONE', 'phone'), 50);
  const email = trunc(logoField(rec, 'EMAILADDR', 'EMAIL', 'email'), 255);
  const taxNr = trunc(logoField(rec, 'TAXNR', 'TAX_ID', 'taxnr'), 50);
  const taxOffice = trunc(logoField(rec, 'TAXOFFICE', 'taxoffice'), 100);
  const address = trunc(logoField(rec, 'ADDR1', 'ADDRESS', 'addr1', 'address'), 2000);
  const city = trunc(logoField(rec, 'CITY', 'city'), 100);

  return {
    firm_nr: firmNr,
    code,
    name,
    phone,
    email,
    tax_nr: taxNr,
    tax_office: taxOffice,
    address,
    city,
    is_active: true,
  };
}

function mapLogoSupplier(rec: Record<string, unknown>, firmNr: string): Record<string, unknown> | null {
  const base = mapLogoCustomer(rec, firmNr);
  if (!base) return null;
  return base;
}

export async function syncLogoProductsFromRest(
  cfg: LogoRestConfig,
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncEntityResult> {
  const firmNr = firmNrPadded();
  const table = `rex_${firmNr}_products`;

  onProgress?.({ phase: 'products', message: 'Logo stok kartları okunuyor…', current: 0 });

  const rawItems = await logoFetchAllPaginated<unknown>(cfg, 'items', {
    maxPages: 500,
  });

  const rows: Record<string, unknown>[] = [];
  for (const raw of rawItems) {
    const rec = unwrapLogoRecord(raw);
    const mapped = mapLogoItem(rec, firmNr);
    if (mapped) rows.push(mapped);
  }

  onProgress?.({
    phase: 'products',
    message: `${rows.length} ürün RetailEX'e yazılıyor…`,
    current: 0,
    total: rows.length,
  });

  const { upserted, errors } = await upsertRows(table, rows, 'code', [
    'ref_id',
    'name',
    'barcode',
    'vat_rate',
    'price',
    'unit',
    'is_active',
  ]);

  onProgress?.({
    phase: 'products',
    message: `Ürünler tamamlandı: ${upserted} kayıt, ${errors} hata`,
    current: upserted,
    total: rows.length,
  });

  return { fetched: rawItems.length, upserted, errors };
}

export async function syncLogoArpsFromRest(
  cfg: LogoRestConfig,
  opts: { customers: boolean; suppliers: boolean },
  onProgress?: (p: LogoSyncProgress) => void
): Promise<{ customers: LogoSyncEntityResult; suppliers: LogoSyncEntityResult }> {
  const firmNr = firmNrPadded();
  const custTable = `rex_${firmNr}_customers`;
  const suppTable = `rex_${firmNr}_suppliers`;

  const empty: LogoSyncEntityResult = { fetched: 0, upserted: 0, errors: 0 };

  if (!opts.customers && !opts.suppliers) {
    return { customers: empty, suppliers: empty };
  }

  onProgress?.({ phase: 'customers', message: 'Logo cari hesaplar okunuyor…' });

  const rawArps = await logoFetchAllPaginated<unknown>(cfg, 'Arps', {
    maxPages: 500,
  });

  const customerRows: Record<string, unknown>[] = [];
  const supplierRows: Record<string, unknown>[] = [];

  for (const raw of rawArps) {
    const rec = unwrapLogoRecord(raw);
    const cardType = arpCardType(rec);
    if (opts.customers && isCustomerCard(cardType)) {
      const mapped = mapLogoCustomer(rec, firmNr);
      if (mapped) customerRows.push(mapped);
    }
    if (opts.suppliers && isSupplierCard(cardType)) {
      const mapped = mapLogoSupplier(rec, firmNr);
      if (mapped) supplierRows.push(mapped);
    }
  }

  let customerResult = empty;
  let supplierResult = empty;

  if (opts.customers && customerRows.length > 0) {
    onProgress?.({
      phase: 'customers',
      message: `${customerRows.length} cari RetailEX'e yazılıyor…`,
      total: customerRows.length,
    });
    const { upserted, errors } = await upsertRows(custTable, customerRows, 'code', [
      'name',
      'phone',
      'email',
      'tax_nr',
      'tax_office',
      'address',
      'city',
      'is_active',
    ]);
    customerResult = { fetched: customerRows.length, upserted, errors };
    onProgress?.({
      phase: 'customers',
      message: `Cariler tamamlandı: ${upserted} kayıt, ${errors} hata`,
      current: upserted,
      total: customerRows.length,
    });
  } else if (opts.customers) {
    customerResult = { fetched: 0, upserted: 0, errors: 0 };
  }

  if (opts.suppliers && supplierRows.length > 0) {
    onProgress?.({
      phase: 'suppliers',
      message: `${supplierRows.length} tedarikçi RetailEX'e yazılıyor…`,
      total: supplierRows.length,
    });
    const { upserted, errors } = await upsertRows(suppTable, supplierRows, 'code', [
      'name',
      'phone',
      'email',
      'tax_nr',
      'tax_office',
      'address',
      'city',
      'is_active',
    ]);
    supplierResult = { fetched: supplierRows.length, upserted, errors };
    onProgress?.({
      phase: 'suppliers',
      message: `Tedarikçiler tamamlandı: ${upserted} kayıt, ${errors} hata`,
      current: upserted,
      total: supplierRows.length,
    });
  } else if (opts.suppliers) {
    supplierResult = { fetched: 0, upserted: 0, errors: 0 };
  }

  return { customers: customerResult, suppliers: supplierResult };
}

/** Logo REST oturumu açıkken tüm seçili kaynakları RetailEX'e aktarır */
export async function syncLogoAllFromRest(
  cfg: LogoRestConfig,
  options: LogoSyncOptions = {},
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncResult> {
  const messages: string[] = [];
  const result: LogoSyncResult = {
    ok: false,
    products: { fetched: 0, upserted: 0, errors: 0 },
    customers: { fetched: 0, upserted: 0, errors: 0 },
    suppliers: { fetched: 0, upserted: 0, errors: 0 },
    messages,
  };

  const syncProducts = options.products !== false;
  const syncCustomers = options.customers !== false;
  const syncSuppliers = options.suppliers !== false;

  try {
    onProgress?.({ phase: 'prepare', message: 'Logo oturumu ve RetailEX tabloları hazırlanıyor…' });
    await logoEnsureSession(cfg);
    const ctx = resolveLogoContext(cfg);
    const firmNr = firmNrPadded();

    messages.push(
      `Senkron: Logo firma ${ctx.firmNr} / dönem ${ctx.periodNr} → RetailEX ${firmNr}`
    );
    onProgress?.({ phase: 'prepare', message: `Firma tabloları kontrol ediliyor (rex_${firmNr}_*)…` });
    await ensureFirmTables(firmNr);
    messages.push(`Tablolar hazır: rex_${firmNr}_products, rex_${firmNr}_customers`);

    if (syncProducts) {
      result.products = await syncLogoProductsFromRest(cfg, onProgress);
      messages.push(
        `Ürünler: ${result.products.upserted}/${result.products.fetched} aktarıldı (${result.products.errors} hata)`
      );
    }

    if (syncCustomers || syncSuppliers) {
      const arp = await syncLogoArpsFromRest(
        cfg,
        { customers: syncCustomers, suppliers: syncSuppliers },
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

    result.ok = true;
    onProgress?.({ phase: 'done', message: 'Logo → RetailEX senkronizasyonu tamamlandı.' });
    messages.push('Senkronizasyon tamamlandı.');
    return result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.error = msg;
    messages.push(`Hata: ${msg}`);
    onProgress?.({ phase: 'error', message: msg });
    return result;
  }
}

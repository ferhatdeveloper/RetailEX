/**
 * Logo Tiger REST → RetailEX veri senkronizasyonu
 */

import {
  ensureLogoBridgeReachable,
  logoEnsureSession,
  logoFetchAllPaginated,
  logoFetchArpBalanceMap,
  logoFetchItemStockMap,
  logoListResource,
  resolveLogoContext,
  type LogoRestConfig,
} from './logoRestApi';
import { DB_SETTINGS, ERP_SETTINGS, postgres } from './postgres';

export type LogoSyncLogEntry = {
  at: string;
  entity: 'product' | 'customer' | 'supplier' | 'invoice' | 'stock' | 'bank' | 'system';
  action: 'read' | 'create' | 'update' | 'skip' | 'error';
  code: string;
  name?: string;
  detail?: string;
  ok: boolean;
};

export type LogoSyncProgress = {
  phase:
    | 'prepare'
    | 'products'
    | 'customers'
    | 'suppliers'
    | 'invoices'
    | 'stock'
    | 'banks'
    | 'done'
    | 'error';
  message: string;
  current?: number;
  total?: number;
  lastLog?: LogoSyncLogEntry;
};

export type LogoRestSyncModules = {
  masterData: boolean;
  customers: boolean;
  suppliers: boolean;
  salesInvoices: boolean;
  purchaseInvoices: boolean;
  itemSlips: boolean;
  banks: boolean;
  salesOrders: boolean;
  purchaseOrders: boolean;
};

export type LogoSyncOptions = {
  products?: boolean;
  customers?: boolean;
  suppliers?: boolean;
  salesInvoices?: boolean;
  purchaseInvoices?: boolean;
  itemSlips?: boolean;
  banks?: boolean;
  salesOrders?: boolean;
  purchaseOrders?: boolean;
  pageSize?: number;
  maxPages?: number;
  onLog?: (entry: LogoSyncLogEntry) => void;
};

export type LogoSyncResult = {
  ok: boolean;
  products: LogoSyncEntityResult;
  customers: LogoSyncEntityResult;
  suppliers: LogoSyncEntityResult;
  salesInvoices: LogoSyncEntityResult;
  purchaseInvoices: LogoSyncEntityResult;
  itemSlips: LogoSyncEntityResult;
  banks: LogoSyncEntityResult;
  messages: string[];
  error?: string;
};

export type LogoSyncEntityResult = {
  fetched: number;
  upserted: number;
  errors: number;
  skipped: number;
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

function periodNrPadded(): string {
  return String(ERP_SETTINGS.periodNr || '01').replace(/\D/g, '').padStart(2, '0') || '01';
}

function salesTable(): string {
  return `rex_${firmNrPadded()}_${periodNrPadded()}_sales`;
}

function saleItemsTable(): string {
  return `rex_${firmNrPadded()}_${periodNrPadded()}_sale_items`;
}

function stockMovementsTable(): string {
  return `rex_${firmNrPadded()}_${periodNrPadded()}_stock_movements`;
}

function stockMovementItemsTable(): string {
  return `rex_${firmNrPadded()}_${periodNrPadded()}_stock_movement_items`;
}

function cashRegistersTable(): string {
  return `rex_${firmNrPadded()}_cash_registers`;
}

function logoRefId(rec: Record<string, unknown>): number | null {
  const n = Math.round(
    numVal(logoField(rec, 'INTERNAL_REFERENCE', 'LOGICALREF', 'internalReference', 'REF'), 0),
  );
  return n > 0 ? n : null;
}

function logoRowRefId(row: Record<string, unknown>): number | null {
  const n = Math.round(numVal(row.ref_id, 0));
  return n > 0 ? n : null;
}

/** Logo LOGICALREF / kod ile aynı partide tekrarları birleştir */
function dedupeLogoMasterRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byRef = new Map<number, Record<string, unknown>>();
  const byCode = new Map<string, Record<string, unknown>>();
  const codesFromRef = new Set<string>();

  for (const row of rows) {
    const code = String(row.code || '').trim();
    const refId = logoRowRefId(row);
    if (!refId && !code) continue;

    if (refId) {
      const prev = byRef.get(refId);
      const merged = prev ? { ...prev, ...row, code: code || String(prev.code || '') } : { ...row, code };
      byRef.set(refId, merged);
      const mergedCode = String(merged.code || '').trim();
      if (mergedCode) codesFromRef.add(mergedCode);
    }
  }

  for (const row of rows) {
    const code = String(row.code || '').trim();
    if (!code || logoRowRefId(row) || codesFromRef.has(code)) continue;
    const prev = byCode.get(code);
    byCode.set(code, prev ? { ...prev, ...row } : row);
  }

  return [...byRef.values(), ...byCode.values()];
}

async function lookupIdByRefId(
  table: string,
  refId: number,
  firmNr: string,
): Promise<string | null> {
  if (isRestApiMode()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<{ id: string }[]>(
      `/${table}`,
      { select: 'id', ref_id: `eq.${refId}`, firm_nr: `eq.${firmNr}`, limit: 1 },
      { schema: 'public' },
    );
    return Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
  }
  const { rows } = await postgres.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE ref_id = $1 AND firm_nr = $2 LIMIT 1`,
    [refId, firmNr],
  );
  return rows[0]?.id ?? null;
}

async function lookupIdByRefOrCode(
  table: string,
  firmNr: string,
  refId: number | null,
  code: string,
): Promise<string | null> {
  if (refId) {
    const byRef = await lookupIdByRefId(table, refId, firmNr);
    if (byRef) return byRef;
  }
  if (code) return lookupIdByCode(table, code, firmNr);
  return null;
}

/** Kod ile kayıtlı satıra Logo LOGICALREF bağla — çift kayıt önlenir */
async function linkRefIdByCode(
  table: string,
  firmNr: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (const row of rows) {
    const refId = logoRowRefId(row);
    const code = String(row.code || '').trim();
    if (!refId || !code) continue;

    const byRef = await lookupIdByRefId(table, refId, firmNr);
    const byCode = await lookupIdByCode(table, code, firmNr);
    if (byCode && byRef && byCode !== byRef) continue;
    if (byCode && !byRef) {
      if (isRestApiMode()) {
        const { postgrest } = await import('./api/postgrestClient');
        await postgrest.patch(
          postgrest.pathOne(table, 'id', byCode),
          { ref_id: refId },
          { schema: 'public', prefer: 'return=minimal' },
        );
      } else {
        await postgres.query(
          `UPDATE ${table} SET ref_id = $1, updated_at = NOW()
           WHERE id = $2 AND firm_nr = $3 AND (ref_id IS NULL OR ref_id = $1)`,
          [refId, byCode, firmNr],
        );
      }
    }
  }
}

async function bulkUpsertLogoMasterRest(
  table: string,
  firmEq: string,
  payloads: Record<string, unknown>[],
): Promise<void> {
  const deduped = dedupeLogoMasterRows(payloads);
  await linkRefIdByCode(table, firmEq, deduped);

  const withRef = deduped.filter((r) => logoRowRefId(r) != null);
  const withoutRef = deduped.filter((r) => logoRowRefId(r) == null && String(r.code || '').trim());

  if (withRef.length > 0) {
    await bulkUpsertTableRest(table, withRef, 'ref_id');
  }
  if (withoutRef.length > 0) {
    await bulkUpsertTableRest(table, withoutRef, 'code');
  }
}

function logoDateVal(rec: Record<string, unknown>): string {
  const raw = logoField(rec, 'DATE', 'date', 'DOC_DATE', 'docDate');
  if (!raw) return new Date().toISOString();
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function ficheTypeFromLogoType(typeVal: unknown, resource: string): string {
  const t = Math.round(numVal(typeVal, 0));
  if (resource === 'purchaseInvoices' || resource === 'purchaseOrders') return 'purchase_invoice';
  if (resource === 'salesInvoices' || resource === 'salesOrders') return 'sales_invoice';
  if (t === 2 || t === 3) return 'return_invoice';
  if ([1, 4, 5, 6, 13, 26, 41, 42].includes(t)) return 'purchase_invoice';
  if ([7, 8, 9, 14, 29, 30, 31, 32].includes(t)) return 'sales_invoice';
  return 'sales_invoice';
}

function emptyEntity(): LogoSyncEntityResult {
  return { fetched: 0, upserted: 0, errors: 0, skipped: 0 };
}

function trunc(s: unknown, max: number): string {
  return String(s ?? '').trim().slice(0, max);
}

export function numVal(v: unknown, fallback = 0): number {
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

export function unwrapLogoRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const inner = o.restRecord ?? o.RestRecord ?? o.record ?? o.Item ?? o.item;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return o;
}

export function logoField(rec: Record<string, unknown>, ...keys: string[]): unknown {
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
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    return;
  }
  await postgres.query('SELECT public.CREATE_FIRM_TABLES($1::varchar)', [firmNr]);
}

async function ensurePeriodTables(firmNr: string, periodNr: string): Promise<void> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    return;
  }
  await postgres.query('SELECT public.CREATE_PERIOD_TABLES($1::varchar, $2::varchar)', [firmNr, periodNr]);
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
  const refId = logoRefId(rec);
  const stock = numVal(
    logoField(rec, 'ONHAND', 'onHand', 'STOCK', 'stock', 'TOTAL_ONHAND', 'REALAMOUNT'),
    0
  );

  return {
    firm_nr: firmNr,
    ref_id: refId,
    code,
    name,
    barcode: barcode || `L${code}`.slice(0, 100),
    vat_rate: vat,
    unit,
    price,
    stock,
    is_active: isActive,
  };
}

function mapLogoArp(rec: Record<string, unknown>, firmNr: string): Record<string, unknown> | null {
  const code = trunc(logoField(rec, 'CODE', 'code'), 50);
  if (!code) return null;

  const name =
    trunc(logoField(rec, 'TITLE', 'DEFINITION_', 'NAME', 'title', 'definition', 'name'), 255) || 'İsimsiz';
  const refId = logoRefId(rec);
  const balance = numVal(logoField(rec, 'BALANCE', 'balance', 'ACC_RISK_TOTAL'), 0);

  return {
    firm_nr: firmNr,
    ref_id: refId,
    code,
    name,
    phone: trunc(logoField(rec, 'TELNRS', 'TELNRS2', 'PHONE', 'phone'), 50),
    email: trunc(logoField(rec, 'EMAILADDR', 'EMAIL', 'email'), 255),
    tax_nr: trunc(logoField(rec, 'TAXNR', 'TAX_ID', 'taxnr'), 50),
    tax_office: trunc(logoField(rec, 'TAXOFFICE', 'taxoffice'), 100),
    address: trunc(logoField(rec, 'ADDR1', 'ADDRESS', 'addr1', 'address'), 2000),
    city: trunc(logoField(rec, 'CITY', 'city'), 100),
    balance,
    is_active: true,
  };
}

async function upsertProductsWithApi(
  rows: Record<string, unknown>[],
  onLog?: LogoSyncOptions['onLog'],
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncEntityResult> {
  const deduped = dedupeLogoMasterRows(rows);
  const total = deduped.length;
  const skipped = rows.length - total;
  const firmEq = firmNrPadded();
  const table = `rex_${firmEq}_products`;

  if (isRestApiMode() && total > 0) {
    const payloads = deduped.map((row) => ({
      firm_nr: firmEq,
      ref_id: row.ref_id ?? null,
      code: String(row.code || ''),
      name: String(row.name || 'İsimsiz'),
      barcode: String(row.barcode || `L${row.code}`).slice(0, 100),
      vat_rate: numVal(row.vat_rate, 18),
      price: numVal(row.price, 0),
      stock: numVal(row.stock, 0),
      unit: String(row.unit || 'Adet'),
      is_active: row.is_active !== false,
      updated_at: new Date().toISOString(),
    }));

    try {
      onProgress?.({
        phase: 'products',
        message: `${total} ürün toplu yazılıyor (ref_id/kod eşleşmesi)…`,
        current: 0,
        total,
      });
      await bulkUpsertLogoMasterRest(table, firmEq, payloads);
      nowLog(onLog, {
        entity: 'product',
        action: 'update',
        code: '*',
        detail: `${total} ürün upsert${skipped ? `, ${skipped} tekrar atlandı` : ''}`,
        ok: true,
      });
      onProgress?.({
        phase: 'products',
        message: `Ürünler: ${total}/${total}`,
        current: total,
        total,
      });
      return { fetched: rows.length, upserted: total, errors: 0, skipped };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      nowLog(onLog, { entity: 'product', action: 'error', code: '*', detail: msg, ok: false });
      throw new Error(`Ürün toplu yazımı başarısız: ${msg}`);
    }
  }

  let upserted = 0;
  let errors = 0;
  let firstError = '';

  for (let i = 0; i < deduped.length; i++) {
    const row = deduped[i];
    const code = String(row.code || '');
    const name = String(row.name || '');
    const refId = logoRowRefId(row);

    try {
      const existingId = await lookupIdByRefOrCode(table, firmEq, refId, code);
      if (existingId) {
        await postgres.query(
          `UPDATE ${table}
           SET ref_id = COALESCE($1, ref_id), code = $2, name = $3, barcode = $4,
               vat_rate = $5, price = $6, stock = $7, unit = $8, is_active = $9, updated_at = NOW()
           WHERE id = $10`,
          [
            refId,
            code,
            name,
            String(row.barcode || ''),
            numVal(row.vat_rate, 18),
            numVal(row.price, 0),
            numVal(row.stock, 0),
            String(row.unit || 'Adet'),
            row.is_active !== false,
            existingId,
          ],
        );
        upserted += 1;
        if (i % LOG_EVERY === 0 || i === total - 1) {
          const lastLog = nowLog(onLog, {
            entity: 'product',
            action: 'update',
            code,
            name,
            detail: refId ? `ref_id ${refId}` : undefined,
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
        await postgres.query(
          `INSERT INTO ${table}
             (firm_nr, ref_id, code, name, barcode, vat_rate, price, stock, unit, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            firmEq,
            refId,
            code,
            name,
            String(row.barcode || `L${code}`).slice(0, 100),
            numVal(row.vat_rate, 18),
            numVal(row.price, 0),
            numVal(row.stock, 0),
            String(row.unit || 'Adet'),
            row.is_active !== false,
          ],
        );
        upserted += 1;
        if (i % LOG_EVERY === 0 || i === total - 1) {
          const lastLog = nowLog(onLog, {
            entity: 'product',
            action: 'create',
            code,
            name,
            detail: refId ? `ref_id ${refId}` : undefined,
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

  return { fetched: rows.length, upserted, errors, skipped };
}

async function upsertCustomersWithApi(
  rows: Record<string, unknown>[],
  onLog?: LogoSyncOptions['onLog'],
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncEntityResult> {
  const deduped = dedupeLogoMasterRows(rows);
  const total = deduped.length;
  const skipped = rows.length - total;
  const firmEq = firmNrPadded();
  const table = `rex_${firmEq}_customers`;

  if (isRestApiMode() && total > 0) {
    const payloads = deduped.map((row) => ({
      firm_nr: firmEq,
      ref_id: row.ref_id ?? null,
      code: String(row.code || ''),
      name: String(row.name || 'İsimsiz'),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      address: String(row.address || ''),
      city: String(row.city || ''),
      tax_nr: String(row.tax_nr || ''),
      tax_office: String(row.tax_office || ''),
      balance: numVal(row.balance, 0),
      is_active: true,
    }));

    try {
      onProgress?.({
        phase: 'customers',
        message: `${total} cari toplu yazılıyor (ref_id/kod eşleşmesi)…`,
        current: 0,
        total,
      });
      await bulkUpsertLogoMasterRest(table, firmEq, payloads);
      return { fetched: rows.length, upserted: total, errors: 0, skipped };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      nowLog(onLog, { entity: 'customer', action: 'error', code: '*', detail: msg, ok: false });
      throw new Error(`Cari toplu yazımı başarısız: ${msg}`);
    }
  }

  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < deduped.length; i++) {
    const row = deduped[i];
    const code = String(row.code || '');
    const name = String(row.name || '');
    const refId = logoRowRefId(row);

    try {
      const existingId = await lookupIdByRefOrCode(table, firmEq, refId, code);
      if (existingId) {
        await postgres.query(
          `UPDATE ${table}
           SET ref_id = COALESCE($1, ref_id), code = $2, name = $3, phone = $4, email = $5,
               address = $6, city = $7, tax_nr = $8, tax_office = $9, balance = $10
           WHERE id = $11`,
          [
            refId,
            code,
            name,
            String(row.phone || ''),
            String(row.email || ''),
            String(row.address || ''),
            String(row.city || ''),
            String(row.tax_nr || ''),
            String(row.tax_office || ''),
            numVal(row.balance, 0),
            existingId,
          ],
        );
        upserted += 1;
        if (i % LOG_EVERY === 0 || i === total - 1) {
          const lastLog = nowLog(onLog, {
            entity: 'customer',
            action: 'update',
            code,
            name,
            detail: refId ? `ref_id ${refId}` : undefined,
            ok: true,
          });
          onProgress?.({
            phase: 'customers',
            message: `Cariler: ${upserted}/${total}`,
            current: upserted,
            total,
            lastLog,
          });
        }
      } else {
        await postgres.query(
          `INSERT INTO ${table}
             (firm_nr, ref_id, code, name, phone, email, address, city, tax_nr, tax_office, balance, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
          [
            firmEq,
            refId,
            code,
            name,
            String(row.phone || ''),
            String(row.email || ''),
            String(row.address || ''),
            String(row.city || ''),
            String(row.tax_nr || ''),
            String(row.tax_office || ''),
            numVal(row.balance, 0),
          ],
        );
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

  return { fetched: rows.length, upserted, errors, skipped };
}

async function upsertSuppliersWithApi(
  rows: Record<string, unknown>[],
  onLog?: LogoSyncOptions['onLog'],
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncEntityResult> {
  const deduped = dedupeLogoMasterRows(rows);
  const total = deduped.length;
  const skipped = rows.length - total;
  const firmEq = firmNrPadded();
  const table = `rex_${firmEq}_suppliers`;

  if (isRestApiMode() && total > 0) {
    const payloads = deduped.map((row) => ({
      firm_nr: firmEq,
      ref_id: row.ref_id ?? null,
      code: String(row.code || ''),
      name: String(row.name || 'İsimsiz'),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      address: String(row.address || ''),
      city: String(row.city || ''),
      tax_nr: String(row.tax_nr || ''),
      tax_office: String(row.tax_office || ''),
      balance: numVal(row.balance, 0),
      is_active: true,
    }));

    try {
      onProgress?.({
        phase: 'suppliers',
        message: `${total} tedarikçi toplu yazılıyor (ref_id/kod eşleşmesi)…`,
        current: 0,
        total,
      });
      await bulkUpsertLogoMasterRest(table, firmEq, payloads);
      return { fetched: rows.length, upserted: total, errors: 0, skipped };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      nowLog(onLog, { entity: 'supplier', action: 'error', code: '*', detail: msg, ok: false });
      throw new Error(`Tedarikçi toplu yazımı başarısız: ${msg}`);
    }
  }

  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < deduped.length; i++) {
    const row = deduped[i];
    const code = String(row.code || '');
    const name = String(row.name || '');
    const refId = logoRowRefId(row);

    try {
      const existingId = await lookupIdByRefOrCode(table, firmEq, refId, code);
      if (existingId) {
        await postgres.query(
          `UPDATE ${table}
           SET ref_id = COALESCE($1, ref_id), code = $2, name = $3, phone = $4, email = $5,
               address = $6, city = $7, tax_nr = $8, tax_office = $9, balance = $10
           WHERE id = $11`,
          [
            refId,
            code,
            name,
            String(row.phone || ''),
            String(row.email || ''),
            String(row.address || ''),
            String(row.city || ''),
            String(row.tax_nr || ''),
            String(row.tax_office || ''),
            numVal(row.balance, 0),
            existingId,
          ],
        );
        upserted += 1;
        if (i % LOG_EVERY === 0 || i === total - 1) {
          const lastLog = nowLog(onLog, {
            entity: 'supplier',
            action: 'update',
            code,
            name,
            detail: refId ? `ref_id ${refId}` : undefined,
            ok: true,
          });
          onProgress?.({
            phase: 'suppliers',
            message: `Tedarikçiler: ${upserted}/${total}`,
            current: upserted,
            total,
            lastLog,
          });
        }
      } else {
        await postgres.query(
          `INSERT INTO ${table}
             (firm_nr, ref_id, code, name, phone, email, address, city, tax_nr, tax_office, balance, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
          [
            firmEq,
            refId,
            code,
            name,
            String(row.phone || ''),
            String(row.email || ''),
            String(row.address || ''),
            String(row.city || ''),
            String(row.tax_nr || ''),
            String(row.tax_office || ''),
            numVal(row.balance, 0),
          ],
        );
        upserted += 1;
        if (i % LOG_EVERY === 0 || i === total - 1) {
          const lastLog = nowLog(onLog, { entity: 'supplier', action: 'create', code, name, ok: true });
          onProgress?.({
            phase: 'suppliers',
            message: `Tedarikçiler: ${upserted}/${total}`,
            current: upserted,
            total,
            lastLog,
          });
        }
      }
    } catch (e: unknown) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      nowLog(onLog, { entity: 'supplier', action: 'error', code, name, detail: msg, ok: false });
    }
  }

  return { fetched: rows.length, upserted, errors, skipped };
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

  onProgress?.({ phase: 'products', message: 'Logo stok miktarları (STINVTOT) okunuyor…' });
  const stockMap = await logoFetchItemStockMap(cfg);
  for (const row of rows) {
    const code = String(row.code || '');
    const stock = stockMap.get(code);
    if (stock != null) row.stock = stock;
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

  if (customerRows.length > 0 || supplierRows.length > 0) {
    onProgress?.({ phase: 'customers', message: 'Logo cari bakiyeleri (CLFLINE) okunuyor…' });
    const balanceMap = await logoFetchArpBalanceMap(cfg);
    for (const row of [...customerRows, ...supplierRows]) {
      const bal = balanceMap.get(String(row.code || ''));
      if (bal) row.balance = bal.balance;
    }
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

async function lookupIdByCode(
  table: string,
  code: string,
  firmNr: string,
): Promise<string | null> {
  if (!code) return null;
  if (isRestApiMode()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<{ id: string }[]>(
      `/${table}`,
      { select: 'id', code: `eq.${code}`, firm_nr: `eq.${firmNr}`, limit: 1 },
      { schema: 'public' },
    );
    return Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
  }
  const { rows } = await postgres.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE code = $1 AND firm_nr = $2 LIMIT 1`,
    [code, firmNr],
  );
  return rows[0]?.id ?? null;
}

function dedupeRowsByCode(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byCode = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const code = String(row.code || '').trim();
    if (!code) continue;
    const prev = byCode.get(code);
    byCode.set(code, prev ? { ...prev, ...row } : row);
  }
  return [...byCode.values()];
}

function formatEntitySummary(label: string, entity: LogoSyncEntityResult): string {
  const parts = [`${entity.upserted}/${entity.fetched}`];
  if (entity.errors > 0) parts.push(`${entity.errors} hata`);
  if (entity.skipped > 0) parts.push(`${entity.skipped} tekrar atlandı`);
  return `${label}: ${parts.join(', ')}`;
}

async function lookupStockMovementId(
  table: string,
  firmNr: string,
  periodNr: string,
  refId: number | null,
  documentNo: string,
): Promise<string | null> {
  if (refId) {
    if (isRestApiMode()) {
      const { postgrest } = await import('./api/postgrestClient');
      const rows = await postgrest.get<{ id: string }[]>(
        `/${table}`,
        {
          select: 'id',
          ref_id: `eq.${refId}`,
          firm_nr: `eq.${firmNr}`,
          period_nr: `eq.${periodNr}`,
          limit: 1,
        },
        { schema: 'public' },
      );
      if (Array.isArray(rows) && rows[0]?.id) return rows[0].id;
    } else {
      const { rows } = await postgres.query<{ id: string }>(
        `SELECT id FROM ${table} WHERE ref_id = $1 AND firm_nr = $2 AND period_nr = $3 LIMIT 1`,
        [refId, firmNr, periodNr],
      );
      if (rows[0]?.id) return rows[0].id;
    }
  }
  if (!documentNo) return null;
  if (isRestApiMode()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<{ id: string }[]>(
      `/${table}`,
      { select: 'id', document_no: `eq.${documentNo}`, limit: 1 },
      { schema: 'public' },
    );
    return Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
  }
  const { rows } = await postgres.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE document_no = $1 LIMIT 1`,
    [documentNo],
  );
  return rows[0]?.id ?? null;
}

async function upsertStockMovementHeader(
  table: string,
  firmNr: string,
  periodNr: string,
  refId: number | null,
  documentNo: string,
  body: Record<string, unknown>,
): Promise<string | null> {
  const existingId = await lookupStockMovementId(table, firmNr, periodNr, refId, documentNo);
  if (existingId) {
    if (isRestApiMode()) {
      const { postgrest } = await import('./api/postgrestClient');
      await postgrest.patch(
        postgrest.pathOne(table, 'id', existingId),
        { ...body, ref_id: refId ?? body.ref_id ?? null },
        { schema: 'public', prefer: 'return=minimal' },
      );
    } else {
      await postgres.query(
        `UPDATE ${table}
         SET ref_id = COALESCE($1, ref_id), document_no = $2, trcode = $3, movement_type = $4,
             movement_date = $5, description = $6, updated_at = NOW()
         WHERE id = $7`,
        [
          refId,
          documentNo,
          body.trcode,
          body.movement_type,
          body.movement_date,
          body.description,
          existingId,
        ],
      );
    }
    return existingId;
  }

  if (isRestApiMode()) {
    const { postgrest } = await import('./api/postgrestClient');
    const payload = {
      ...body,
      firm_nr: firmNr,
      period_nr: periodNr,
      ref_id: refId,
      document_no: documentNo,
    };
    const saved = refId
      ? await postgrest.upsert(`/${table}`, [payload], 'ref_id', {
          schema: 'public',
          prefer: 'return=representation',
        })
      : await postgrest.upsert(`/${table}`, [payload], 'document_no', {
          schema: 'public',
          prefer: 'return=representation',
        });
    return Array.isArray(saved) && saved[0]?.id ? String(saved[0].id) : null;
  }

  const { rows } = await postgres.query<{ id: string }>(
    `INSERT INTO ${table}
       (firm_nr, period_nr, ref_id, document_no, trcode, movement_type, movement_date, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      firmNr,
      periodNr,
      refId,
      documentNo,
      body.trcode,
      body.movement_type,
      body.movement_date,
      body.description,
    ],
  );
  return rows[0]?.id ?? null;
}

async function replaceStockMovementLines(
  itemsTable: string,
  movementId: string,
  lines: Record<string, unknown>[],
): Promise<void> {
  if (isRestApiMode()) {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.delete(`/${itemsTable}?movement_id=eq.${encodeURIComponent(movementId)}`, {
      schema: 'public',
    });
    if (lines.length > 0) {
      const withRef = lines.filter((r) => logoRowRefId(r) != null);
      const withoutRef = lines.filter((r) => logoRowRefId(r) == null);
      if (withRef.length > 0) {
        await postgrest.upsert(`/${itemsTable}`, withRef, 'ref_id', { schema: 'public' });
      }
      if (withoutRef.length > 0) {
        await postgrest.post(`/${itemsTable}`, withoutRef, { schema: 'public', prefer: 'return=minimal' });
      }
    }
    return;
  }

  await postgres.query(`DELETE FROM ${itemsTable} WHERE movement_id = $1`, [movementId]);
  for (const line of lines) {
    const lineRef = logoRowRefId(line);
    if (lineRef) {
      await postgres.query(
        `INSERT INTO ${itemsTable}
           (ref_id, movement_id, product_id, quantity, notes)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (ref_id) DO UPDATE SET
           movement_id = EXCLUDED.movement_id,
           product_id = EXCLUDED.product_id,
           quantity = EXCLUDED.quantity,
           notes = EXCLUDED.notes`,
        [lineRef, movementId, line.product_id, line.quantity, line.notes],
      );
    } else {
      await postgres.query(
        `INSERT INTO ${itemsTable} (movement_id, product_id, quantity, notes) VALUES ($1,$2,$3,$4)`,
        [movementId, line.product_id, line.quantity, line.notes],
      );
    }
  }
}

function extractInvoiceLines(rec: Record<string, unknown>): Record<string, unknown>[] {
  const tx = logoField(rec, 'TRANSACTIONS', 'transactions');
  if (!tx || typeof tx !== 'object') return [];
  const o = tx as Record<string, unknown>;
  const items = o.items ?? o.Items ?? o.item ?? o.Item;
  if (!Array.isArray(items)) return [];
  return items.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
}

async function upsertInvoiceBatch(
  resource: string,
  rawList: unknown[],
  ficheTypeDefault: string,
  onLog?: LogoSyncOptions['onLog'],
): Promise<LogoSyncEntityResult> {
  const firmNr = firmNrPadded();
  const periodNr = periodNrPadded();
  const stSales = salesTable();
  const stItems = saleItemsTable();
  let upserted = 0;
  let errors = 0;

  for (const raw of rawList) {
    const rec = unwrapLogoRecord(raw);
    const ficheNo = trunc(logoField(rec, 'NUMBER', 'FICHENO', 'number'), 100);
    if (!ficheNo) continue;

    const refId = logoRefId(rec);
    const arpCode = trunc(logoField(rec, 'ARP_CODE', 'arpCode', 'CLIENT_CODE'), 50);
    const trcode = Math.round(numVal(logoField(rec, 'TYPE', 'TRCODE', 'type'), 0));
    const ficheType = ficheTypeFromLogoType(trcode, resource) || ficheTypeDefault;
    const net = numVal(logoField(rec, 'TOTAL_NET', 'totalNet', 'NETTOTAL'), 0);
    const vat = numVal(logoField(rec, 'TOTAL_VAT', 'totalVat', 'VATAMOUNT'), 0);
    const gross = numVal(logoField(rec, 'TOTAL_GROSS', 'totalGross', 'GROSSTOTAL'), net + vat);
    const date = logoDateVal(rec);

    const customerId = arpCode ? await lookupIdByCode(`rex_${firmNr}_customers`, arpCode, firmNr) : null;
    const supplierId = arpCode ? await lookupIdByCode(`rex_${firmNr}_suppliers`, arpCode, firmNr) : null;
    const accountId = customerId || supplierId;

    const header: Record<string, unknown> = {
      firm_nr: firmNr,
      period_nr: periodNr,
      ref_id: refId,
      logo_client_ref: refId,
      fiche_no: ficheNo,
      customer_id: accountId,
      customer_name: arpCode || null,
      trcode: trcode || null,
      fiche_type: ficheType,
      total_net: net,
      total_vat: vat,
      total_gross: gross,
      net_amount: net,
      date,
      is_cancelled: false,
    };

    try {
      if (isRestApiMode()) {
        const { postgrest } = await import('./api/postgrestClient');
        const saved = await postgrest.upsert(`/${stSales}`, [header], 'fiche_no', {
          schema: 'public',
          prefer: 'return=representation',
        });
        const invoiceId = Array.isArray(saved) && saved[0]?.id ? String(saved[0].id) : null;
        if (!invoiceId && refId) {
          const found = await postgrest.get<{ id: string }[]>(
            `/${stSales}`,
            { select: 'id', fiche_no: `eq.${ficheNo}`, limit: 1 },
            { schema: 'public' },
          );
          if (Array.isArray(found) && found[0]?.id) {
            await processInvoiceLines(stItems, found[0].id, firmNr, periodNr, refId, rec, onLog);
          }
        } else if (invoiceId) {
          await processInvoiceLines(stItems, invoiceId, firmNr, periodNr, refId, rec, onLog);
        }
      } else {
        const { rows } = await postgres.query<{ id: string }>(
          `INSERT INTO ${stSales}
             (firm_nr, period_nr, ref_id, logo_client_ref, fiche_no, customer_id, customer_name, trcode, fiche_type,
              total_net, total_vat, total_gross, net_amount, date, is_cancelled)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false)
           ON CONFLICT (fiche_no) DO UPDATE SET
             ref_id = EXCLUDED.ref_id, customer_id = EXCLUDED.customer_id, trcode = EXCLUDED.trcode,
             fiche_type = EXCLUDED.fiche_type, total_net = EXCLUDED.total_net, total_vat = EXCLUDED.total_vat,
             total_gross = EXCLUDED.total_gross, net_amount = EXCLUDED.net_amount, date = EXCLUDED.date
           RETURNING id`,
          [
            firmNr, periodNr, refId, refId, ficheNo, accountId, arpCode || null, trcode || null, ficheType,
            net, vat, gross, net, date,
          ],
        );
        const invoiceId = rows[0]?.id;
        if (invoiceId) {
          await processInvoiceLines(stItems, invoiceId, firmNr, periodNr, refId, rec, onLog);
        }
      }
      upserted += 1;
    } catch (e: unknown) {
      errors += 1;
      nowLog(onLog, {
        entity: 'invoice',
        action: 'error',
        code: ficheNo,
        detail: e instanceof Error ? e.message : String(e),
        ok: false,
      });
    }
  }

  return { fetched: rawList.length, upserted, errors, skipped: 0 };
}

async function processInvoiceLines(
  stItems: string,
  invoiceId: string,
  firmNr: string,
  periodNr: string,
  invRef: number | null,
  rec: Record<string, unknown>,
  onLog?: LogoSyncOptions['onLog'],
): Promise<void> {
  const lines = extractInvoiceLines(rec);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const itemCode = trunc(logoField(ln, 'MASTER_CODE', 'CODE', 'masterCode'), 100);
    const qty = numVal(logoField(ln, 'QUANTITY', 'quantity', 'AMOUNT'), 0);
    const price = numVal(logoField(ln, 'PRICE', 'price', 'UNIT_PRICE'), 0);
    const vatRate = numVal(logoField(ln, 'VAT_RATE', 'vatRate', 'VAT'), 18);
    const net = numVal(logoField(ln, 'TOTAL', 'LINENET', 'total', 'net_amount'), qty * price);
    const lineRef =
      Math.round(numVal(logoField(ln, 'INTERNAL_REFERENCE', 'LINE_INTERNAL_REFERENCE'), 0)) ||
      (invRef ? invRef * 10000 + i + 1 : i + 1);
    const productId = itemCode
      ? await lookupIdByCode(`rex_${firmNr}_products`, itemCode, firmNr)
      : null;

    const row = {
      ref_id: lineRef,
      logo_product_ref: Math.round(numVal(logoField(ln, 'INTERNAL_REFERENCE', 'STOCKREF'), 0)) || null,
      invoice_id: invoiceId,
      firm_nr: firmNr,
      period_nr: periodNr,
      item_code: itemCode,
      product_id: productId,
      quantity: qty,
      unit_price: price,
      vat_rate: vatRate,
      net_amount: net,
      total_amount: net,
    };

    try {
      if (isRestApiMode()) {
        const { postgrest } = await import('./api/postgrestClient');
        await postgrest.upsert(`/${stItems}`, [row], 'ref_id', { schema: 'public' });
      } else {
        await postgres.query(
          `INSERT INTO ${stItems}
             (ref_id, logo_product_ref, invoice_id, firm_nr, period_nr, item_code, product_id, quantity, unit_price, vat_rate, net_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (ref_id) DO UPDATE SET
             quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price,
             net_amount = EXCLUDED.net_amount, total_amount = EXCLUDED.total_amount`,
          [
            lineRef, row.logo_product_ref, invoiceId, firmNr, periodNr, itemCode, productId,
            qty, price, vatRate, net, net,
          ],
        );
      }
    } catch (e: unknown) {
      nowLog(onLog, {
        entity: 'invoice',
        action: 'error',
        code: itemCode || `line-${i}`,
        detail: e instanceof Error ? e.message : String(e),
        ok: false,
      });
    }
  }
}

export async function syncLogoInvoicesFromRest(
  cfg: LogoRestConfig,
  resource: 'salesInvoices' | 'purchaseInvoices' | 'salesOrders' | 'purchaseOrders',
  options: Pick<LogoSyncOptions, 'onLog'> = {},
  onProgress?: (p: LogoSyncProgress) => void,
): Promise<LogoSyncEntityResult> {
  const ficheDefault =
    resource === 'purchaseInvoices' || resource === 'purchaseOrders'
      ? 'purchase_invoice'
      : 'sales_invoice';

  onProgress?.({ phase: 'invoices', message: `Logo ${resource} okunuyor…` });
  nowLog(options.onLog, { entity: 'invoice', action: 'read', code: resource, ok: true });

  const raw = await logoFetchAllPaginated<unknown>(cfg, resource, { maxPages: 500, pageSize: 15 });
  onProgress?.({
    phase: 'invoices',
    message: `${raw.length} ${resource} kaydı yazılıyor…`,
    total: raw.length,
  });

  return upsertInvoiceBatch(resource, raw, ficheDefault, options.onLog);
}

export async function syncLogoItemSlipsFromRest(
  cfg: LogoRestConfig,
  options: Pick<LogoSyncOptions, 'onLog'> = {},
  onProgress?: (p: LogoSyncProgress) => void,
): Promise<LogoSyncEntityResult> {
  const firmNr = firmNrPadded();
  const periodNr = periodNrPadded();
  const stMv = stockMovementsTable();
  const stMi = stockMovementItemsTable();

  onProgress?.({ phase: 'stock', message: 'Logo malzeme fişleri (itemSlips) okunuyor…' });
  const raw = await logoFetchAllPaginated<unknown>(cfg, 'itemSlips', { maxPages: 500, pageSize: 15 });
  let upserted = 0;
  let errors = 0;
  let skipped = 0;

  const seenRefs = new Set<number>();
  const seenDocs = new Set<string>();

  for (const item of raw) {
    const rec = unwrapLogoRecord(item);
    const refId = logoRefId(rec);
    const docNo =
      trunc(logoField(rec, 'NUMBER', 'FICHENO', 'number'), 50) || (refId ? `LG-${refId}` : '');
    if (!docNo && !refId) {
      skipped++;
      continue;
    }
    if (refId && seenRefs.has(refId)) {
      skipped++;
      continue;
    }
    if (docNo && seenDocs.has(docNo)) {
      skipped++;
      continue;
    }
    if (refId) seenRefs.add(refId);
    if (docNo) seenDocs.add(docNo);

    const ioType = Math.round(numVal(logoField(rec, 'TYPE', 'IOCODE', 'type'), 0));
    const movementType = [1, 2, 5, 10, 11, 12, 13].includes(ioType) ? 'in' : 'out';
    const date = logoDateVal(rec);
    const headerBody = {
      firm_nr: firmNr,
      period_nr: periodNr,
      trcode: ioType,
      movement_type: movementType,
      movement_date: date,
      description: trunc(logoField(rec, 'NOTES1', 'LINEEXP', 'notes'), 500),
    };

    try {
      const movementId = await upsertStockMovementHeader(
        stMv,
        firmNr,
        periodNr,
        refId,
        docNo,
        headerBody,
      );
      if (!movementId) continue;

      const slipLines = extractInvoiceLines(rec);
      const lineRows: Record<string, unknown>[] = [];
      for (let i = 0; i < slipLines.length; i++) {
        const ln = slipLines[i];
        const itemCode = trunc(logoField(ln, 'MASTER_CODE', 'CODE'), 100);
        const qty = numVal(logoField(ln, 'QUANTITY', 'quantity', 'AMOUNT'), 0);
        const productId = itemCode
          ? await lookupIdByCode(`rex_${firmNr}_products`, itemCode, firmNr)
          : null;
        const lineRef =
          Math.round(numVal(logoField(ln, 'INTERNAL_REFERENCE', 'LINE_INTERNAL_REFERENCE'), 0)) ||
          (refId ? refId * 10000 + i + 1 : null);
        lineRows.push({
          ref_id: lineRef,
          movement_id: movementId,
          product_id: productId,
          quantity: qty,
          notes: itemCode,
        });
      }

      await replaceStockMovementLines(stMi, movementId, lineRows);
      upserted += 1;
    } catch (e: unknown) {
      errors += 1;
      nowLog(options.onLog, {
        entity: 'stock',
        action: 'error',
        code: docNo || String(refId || '?'),
        detail: e instanceof Error ? e.message : String(e),
        ok: false,
      });
    }
  }

  onProgress?.({ phase: 'stock', message: `Stok fişleri: ${upserted}/${raw.length}` });
  return { fetched: raw.length, upserted, errors, skipped };
}

export async function syncLogoBanksFromRest(
  cfg: LogoRestConfig,
  options: Pick<LogoSyncOptions, 'onLog'> = {},
  onProgress?: (p: LogoSyncProgress) => void,
): Promise<LogoSyncEntityResult> {
  const firmNr = firmNrPadded();
  const table = cashRegistersTable();

  onProgress?.({ phase: 'banks', message: 'Logo kasa/banka kartları okunuyor…' });
  let raw: unknown[] = [];
  for (const resource of ['banks', 'bankAccounts'] as const) {
    try {
      raw = await logoFetchAllPaginated<unknown>(cfg, resource, { maxPages: 100, pageSize: 15 });
      if (raw.length > 0) break;
    } catch {
      /* sonraki kaynak */
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (const item of raw) {
    const rec = unwrapLogoRecord(item);
    const code = trunc(logoField(rec, 'CODE', 'code'), 50);
    if (!code) continue;
    rows.push({
      firm_nr: firmNr,
      code,
      name: trunc(logoField(rec, 'DEFINITION_', 'NAME', 'TITLE', 'name'), 255) || code,
      is_active: true,
    });
  }

  const deduped = dedupeRowsByCode(rows);
  const skipped = rows.length - deduped.length;

  if (deduped.length === 0) {
    return { ...emptyEntity(), skipped };
  }

  try {
    if (isRestApiMode()) {
      await bulkUpsertTableRest(table, deduped, 'code');
    } else {
      for (const row of deduped) {
        await postgres.query(
          `INSERT INTO ${table} (firm_nr, code, name, is_active)
           VALUES ($1,$2,$3,true)
           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
          [row.firm_nr, row.code, row.name],
        );
      }
    }
    onProgress?.({ phase: 'banks', message: `Kasa/banka: ${deduped.length} kayıt` });
    return { fetched: raw.length, upserted: deduped.length, errors: 0, skipped };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    nowLog(options.onLog, { entity: 'bank', action: 'error', code: '*', detail: msg, ok: false });
    return { fetched: raw.length, upserted: 0, errors: 1, skipped: 0 };
  }
}

export async function syncLogoAllFromRest(
  cfg: LogoRestConfig,
  options: LogoSyncOptions = {},
  onProgress?: (p: LogoSyncProgress) => void
): Promise<LogoSyncResult> {
  const messages: string[] = [];
  const result: LogoSyncResult = {
    ok: false,
    products: emptyEntity(),
    customers: emptyEntity(),
    suppliers: emptyEntity(),
    salesInvoices: emptyEntity(),
    purchaseInvoices: emptyEntity(),
    itemSlips: emptyEntity(),
    banks: emptyEntity(),
    messages,
  };

  const syncProducts = options.products !== false;
  const syncCustomers = options.customers !== false;
  const syncSuppliers = options.suppliers !== false;
  const syncSalesInv = options.salesInvoices !== false;
  const syncPurchaseInv = options.purchaseInvoices !== false;
  const syncSlips = options.itemSlips !== false;
  const syncBanks = options.banks !== false;
  const syncSalesOrd = options.salesOrders === true;
  const syncPurchaseOrd = options.purchaseOrders === true;

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
    const periodNr = periodNrPadded();

    messages.push(`Senkron: Logo ${ctx.firmNr}/${ctx.periodNr} → RetailEX ${firmNr}/${periodNr}`);
    onProgress?.({ phase: 'prepare', message: `Tablolar hazırlanıyor…` });
    await ensureFirmTables(firmNr);
    await ensurePeriodTables(firmNr, periodNr);
    messages.push(`Tablolar hazır: rex_${firmNr}_* / rex_${firmNr}_${periodNr}_*`);

    if (syncProducts) {
      result.products = await syncLogoProductsFromRest(cfg, options, onProgress);
      messages.push(formatEntitySummary('Ürünler', result.products));
    }

    if (syncCustomers || syncSuppliers) {
      const arp = await syncLogoArpsFromRest(
        cfg,
        { customers: syncCustomers, suppliers: syncSuppliers, onLog: options.onLog },
        onProgress,
      );
      result.customers = arp.customers;
      result.suppliers = arp.suppliers;
      if (syncCustomers) {
        messages.push(formatEntitySummary('Cariler', result.customers));
      }
      if (syncSuppliers) {
        messages.push(formatEntitySummary('Tedarikçiler', result.suppliers));
      }
    }

    if (syncSalesInv) {
      result.salesInvoices = await syncLogoInvoicesFromRest(cfg, 'salesInvoices', options, onProgress);
      messages.push(
        `Satış faturaları: ${result.salesInvoices.upserted}/${result.salesInvoices.fetched}`,
      );
    }
    if (syncPurchaseInv) {
      result.purchaseInvoices = await syncLogoInvoicesFromRest(cfg, 'purchaseInvoices', options, onProgress);
      messages.push(
        `Alış faturaları: ${result.purchaseInvoices.upserted}/${result.purchaseInvoices.fetched}`,
      );
    }
    if (syncSalesOrd) {
      const ord = await syncLogoInvoicesFromRest(cfg, 'salesOrders', options, onProgress);
      result.salesInvoices.upserted += ord.upserted;
      result.salesInvoices.fetched += ord.fetched;
      messages.push(`Satış siparişleri: ${ord.upserted}/${ord.fetched}`);
    }
    if (syncPurchaseOrd) {
      const ord = await syncLogoInvoicesFromRest(cfg, 'purchaseOrders', options, onProgress);
      result.purchaseInvoices.upserted += ord.upserted;
      result.purchaseInvoices.fetched += ord.fetched;
      messages.push(`Alış siparişleri: ${ord.upserted}/${ord.fetched}`);
    }
    if (syncSlips) {
      result.itemSlips = await syncLogoItemSlipsFromRest(cfg, options, onProgress);
      messages.push(formatEntitySummary('Stok fişleri', result.itemSlips));
    }
    if (syncBanks) {
      result.banks = await syncLogoBanksFromRest(cfg, options, onProgress);
      messages.push(formatEntitySummary('Kasa/banka', result.banks));
    }

    const failedProducts = syncProducts && result.products.fetched > 0 && result.products.upserted === 0;
    const failedCustomers =
      syncCustomers && result.customers.fetched > 0 && result.customers.upserted === 0;
    const failedInv =
      (syncSalesInv || syncPurchaseInv) &&
      result.salesInvoices.fetched + result.purchaseInvoices.fetched > 0 &&
      result.salesInvoices.upserted + result.purchaseInvoices.upserted === 0;

    result.ok = !failedProducts && !failedCustomers && !failedInv;

    if (!result.ok) {
      result.error = 'Bazı kayıtlar okundu ancak RetailEX\'e yazılamadı. Canlı loga bakın.';
      onProgress?.({ phase: 'error', message: result.error });
    } else {
      onProgress?.({ phase: 'done', message: 'Logo REST → RetailEX senkronizasyonu tamamlandı.' });
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

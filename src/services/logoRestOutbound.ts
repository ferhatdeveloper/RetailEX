/**
 * RetailEX (PostgREST / PG) → Logo Tiger REST giden yazım.
 * Kartlar + belgeler + stok fişleri (logo_sync_status=pending).
 */

import {
  extractLogoInternalRef,
  logoCreateResource,
  logoRefreshSession,
  logoUpdateResource,
  loadLogoRestConfig,
  resolveLogoRestUrlSource,
  type LogoRestConfig,
} from './logoRestApi';
import { loadLogoErpMode } from './logoErpMode';
import { buildLogoItemRestRecord } from './logoRestItemMap';
import type { LogoSyncLogEntry } from './logoRestSync';
import {
  pushPendingDocumentsToLogo,
  type LogoDocumentPushKind,
  type LogoDocumentPushResult,
} from './logoRestDocumentPush';
import type { LogoInvoicePushResult } from './logoRestInvoicePush';
import { DB_SETTINGS, ERP_SETTINGS, postgres } from './postgres';

export { extractLogoInternalRef };

export type LogoOutboundEntityResult = {
  processed: number;
  success: number;
  errors: number;
  messages: string[];
};

export type LogoOutboundPushResult = {
  products: LogoOutboundEntityResult;
  customers: LogoOutboundEntityResult;
  suppliers: LogoOutboundEntityResult;
  banks: LogoOutboundEntityResult;
  invoices: LogoInvoicePushResult;
  purchaseInvoices: LogoDocumentPushResult;
  salesOrders: LogoDocumentPushResult;
  purchaseOrders: LogoDocumentPushResult;
  salesDispatches: LogoDocumentPushResult;
  purchaseDispatches: LogoDocumentPushResult;
  itemSlips: LogoOutboundEntityResult;
  messages: string[];
  success: number;
  errors: number;
};

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
}

function productsTable(): string {
  return `rex_${firmNrPadded()}_products`;
}

function customersTable(): string {
  return `rex_${firmNrPadded()}_customers`;
}

function suppliersTable(): string {
  return `rex_${firmNrPadded()}_suppliers`;
}

function cashRegistersTable(): string {
  return `rex_${firmNrPadded()}_cash_registers`;
}

function stockMovementsTable(): string {
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
  return `rex_${firmNrPadded()}_${period}_stock_movements`;
}

function stockMovementItemsTable(): string {
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
  return `rex_${firmNrPadded()}_${period}_stock_movement_items`;
}

function emptyDoc(): LogoDocumentPushResult {
  return { processed: 0, success: 0, errors: 0, messages: [] };
}

/** Web/masaüstü: Logo REST URL yapılandırılmış ve REST modu. */
export function isLogoRestOutboundEnabled(): boolean {
  if (loadLogoErpMode() !== 'rest') return false;
  return resolveLogoRestUrlSource() !== 'none';
}

/** Yerel create/update gövdesine eklenecek kuyruk alanları. */
export function logoOutboundPendingFields(): Record<string, unknown> {
  if (!isLogoRestOutboundEnabled()) return {};
  return {
    logo_sync_status: 'pending',
    logo_sync_error: null,
  };
}

/** Logo çekiminden gelen satırlar geri gönderilmesin. */
export function logoOutboundPulledFields(): Record<string, unknown> {
  return {
    logo_sync_status: 'success',
    logo_sync_error: null,
    logo_sync_date: new Date().toISOString(),
  };
}

function emptyEntity(): LogoOutboundEntityResult {
  return { processed: 0, success: 0, errors: 0, messages: [] };
}

async function fetchPendingRows(table: string, limit: number): Promise<Record<string, unknown>[]> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<Record<string, unknown>[]>(
      `/${table}`,
      {
        select: '*',
        logo_sync_status: 'eq.pending',
        order: 'updated_at.asc',
        limit,
      },
      { schema: 'public' },
    );
    return Array.isArray(rows) ? rows : [];
  }
  const { rows } = await postgres.query<Record<string, unknown>>(
    `SELECT * FROM ${table}
     WHERE logo_sync_status = 'pending'
     ORDER BY COALESCE(updated_at, created_at) ASC NULLS LAST
     LIMIT $1`,
    [limit],
  );
  return rows;
}

async function markMasterSync(
  table: string,
  id: string,
  status: 'success' | 'error' | 'pending',
  opts?: { error?: string; refId?: number | null },
): Promise<void> {
  const patch: Record<string, unknown> = {
    logo_sync_status: status,
    logo_sync_error: opts?.error || null,
    logo_sync_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (opts?.refId != null && opts.refId > 0) {
    patch.ref_id = opts.refId;
  }

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.patch(`/${table}?id=eq.${encodeURIComponent(id)}`, patch, {
      schema: 'public',
      prefer: 'return=minimal',
    });
    return;
  }

  const refSql =
    opts?.refId != null && opts.refId > 0
      ? `, ref_id = COALESCE($4, ref_id)`
      : '';
  const params =
    opts?.refId != null && opts.refId > 0
      ? [id, status, opts?.error || null, opts.refId]
      : [id, status, opts?.error || null];
  await postgres.query(
    `UPDATE ${table}
     SET logo_sync_status = $2,
         logo_sync_error = $3,
         logo_sync_date = NOW(),
         updated_at = NOW()
         ${refSql}
     WHERE id = $1`,
    params,
  );
}

/** RetailEX ürün → Logo items restRecord (UNITSET/UNITS/barkod/KDV/PRCLIST) */
function buildItemRecord(row: Record<string, unknown>): Record<string, unknown> {
  return buildLogoItemRestRecord(row);
}

function buildArpRecord(
  row: Record<string, unknown>,
  role: 'customer' | 'supplier',
): Record<string, unknown> {
  const code = String(row.code || '').trim();
  const name = String(row.name || code || 'Cari').trim();
  // Logo REST: ACCOUNT_TYPE 2≈müşteri, 1≈tedarikçi (çekim resolveArpRoles ile uyumlu)
  const accountType = role === 'supplier' ? 1 : 2;
  return {
    CODE: code.slice(0, 25),
    TITLE: name.slice(0, 100),
    DEFINITION_: name.slice(0, 100),
    ACCOUNT_TYPE: accountType,
    TAXNR: String(row.tax_nr || row.tax_number || '').trim().slice(0, 20),
    TAXOFFICE: String(row.tax_office || '').trim().slice(0, 50),
    ADDR1: String(row.address || '').trim().slice(0, 50),
    CITY: String(row.city || '').trim().slice(0, 20),
    TELNRS: String(row.phone || '').trim().slice(0, 20),
    EMAILADDR: String(row.email || '').trim().slice(0, 50),
  };
}

async function pushPendingMasterEntity(
  cfg: LogoRestConfig,
  opts: {
    table: string;
    resource: 'items' | 'Arps' | 'banks' | 'bankAccounts';
    role?: 'customer' | 'supplier';
    entity: LogoSyncLogEntry['entity'];
    label: string;
    limit: number;
    onLog?: (entry: LogoSyncLogEntry) => void;
    build: (row: Record<string, unknown>) => Record<string, unknown>;
  },
): Promise<LogoOutboundEntityResult> {
  const messages: string[] = [];
  let success = 0;
  let errors = 0;

  let pending: Record<string, unknown>[] = [];
  try {
    pending = await fetchPendingRows(opts.table, opts.limit);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/logo_sync_status|42703|does not exist/i.test(msg)) {
      messages.push(
        `${opts.label}: logo_sync kolonları yok — migration 112 uygulanmalı (${msg})`,
      );
      return { processed: 0, success: 0, errors: 1, messages };
    }
    throw e;
  }

  messages.push(`${pending.length} bekleyen ${opts.label} bulundu.`);

  for (const row of pending) {
    const id = String(row.id || '');
    const code = String(row.code || id).trim();
    const name = String(row.name || '');
    const existingRef = Math.round(Number(row.ref_id)) || 0;

    try {
      if (!code) throw new Error('Kod boş — Logo yazımı atlandı');
      const restRecord = opts.build(row);
      let created: unknown;
      if (existingRef > 0) {
        created = await logoUpdateResource(cfg, opts.resource, existingRef, restRecord);
      } else {
        created = await logoCreateResource(cfg, opts.resource, restRecord);
      }
      const newRef = extractLogoInternalRef(created) || existingRef || null;
      if (id) {
        // cash_registers'ta ref_id yok — yalnızca ürün/cari tablolarına yaz
        const canStoreRef = opts.resource === 'items' || opts.resource === 'Arps';
        await markMasterSync(opts.table, id, 'success', {
          refId: canStoreRef ? newRef : null,
        });
      }
      success += 1;
      opts.onLog?.({
        at: new Date().toISOString(),
        entity: opts.entity,
        action: existingRef > 0 ? 'update' : 'create',
        code,
        name,
        detail: newRef ? `Logo ref ${newRef}` : 'Logo yazıldı',
        ok: true,
      });
      messages.push(`${opts.label} ${code} → Logo OK`);
    } catch (e: unknown) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (id) await markMasterSync(opts.table, id, 'error', { error: msg }).catch(() => {});
      opts.onLog?.({
        at: new Date().toISOString(),
        entity: opts.entity,
        action: 'error',
        code,
        name,
        detail: msg,
        ok: false,
      });
      messages.push(`${opts.label} ${code} hata: ${msg}`);
    }
  }

  return { processed: pending.length, success, errors, messages };
}

export async function pushPendingProductsToLogo(
  cfg?: LogoRestConfig,
  opts: { limit?: number; onLog?: (entry: LogoSyncLogEntry) => void; refreshSession?: boolean } = {},
): Promise<LogoOutboundEntityResult> {
  const config = cfg ?? loadLogoRestConfig();
  if (opts.refreshSession !== false) await logoRefreshSession(config);
  return pushPendingMasterEntity(config, {
    table: productsTable(),
    resource: 'items',
    entity: 'product',
    label: 'ürün',
    limit: opts.limit ?? 40,
    onLog: opts.onLog,
    build: buildItemRecord,
  });
}

export async function pushPendingCustomersToLogo(
  cfg?: LogoRestConfig,
  opts: { limit?: number; onLog?: (entry: LogoSyncLogEntry) => void; refreshSession?: boolean } = {},
): Promise<LogoOutboundEntityResult> {
  const config = cfg ?? loadLogoRestConfig();
  if (opts.refreshSession !== false) await logoRefreshSession(config);
  return pushPendingMasterEntity(config, {
    table: customersTable(),
    resource: 'Arps',
    role: 'customer',
    entity: 'customer',
    label: 'müşteri',
    limit: opts.limit ?? 40,
    onLog: opts.onLog,
    build: (row) => buildArpRecord(row, 'customer'),
  });
}

export async function pushPendingSuppliersToLogo(
  cfg?: LogoRestConfig,
  opts: { limit?: number; onLog?: (entry: LogoSyncLogEntry) => void; refreshSession?: boolean } = {},
): Promise<LogoOutboundEntityResult> {
  const config = cfg ?? loadLogoRestConfig();
  if (opts.refreshSession !== false) await logoRefreshSession(config);
  return pushPendingMasterEntity(config, {
    table: suppliersTable(),
    resource: 'Arps',
    role: 'supplier',
    entity: 'supplier',
    label: 'tedarikçi',
    limit: opts.limit ?? 40,
    onLog: opts.onLog,
    build: (row) => buildArpRecord(row, 'supplier'),
  });
}

function buildBankRecord(row: Record<string, unknown>): Record<string, unknown> {
  const code = String(row.code || '').trim();
  const name = String(row.name || code || 'Kasa').trim();
  return {
    CODE: code.slice(0, 25),
    TITLE: name.slice(0, 100),
    DEFINITION_: name.slice(0, 100),
  };
}

export async function pushPendingBanksToLogo(
  cfg?: LogoRestConfig,
  opts: { limit?: number; onLog?: (entry: LogoSyncLogEntry) => void; refreshSession?: boolean } = {},
): Promise<LogoOutboundEntityResult> {
  const config = cfg ?? loadLogoRestConfig();
  if (opts.refreshSession !== false) await logoRefreshSession(config);
  return pushPendingMasterEntity(config, {
    table: cashRegistersTable(),
    resource: 'banks',
    entity: 'bank',
    label: 'kasa/banka',
    limit: opts.limit ?? 40,
    onLog: opts.onLog,
    build: buildBankRecord,
  });
}

async function fetchMovementLines(movementId: string): Promise<Record<string, unknown>[]> {
  const table = stockMovementItemsTable();
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<Record<string, unknown>[]>(
      `/${table}`,
      { select: '*', movement_id: `eq.${movementId}`, limit: 500 },
      { schema: 'public' },
    );
    return Array.isArray(rows) ? rows : [];
  }
  const { rows } = await postgres.query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE movement_id = $1`,
    [movementId],
  );
  return rows;
}

async function resolveProductCode(productId: unknown, notes: unknown): Promise<string> {
  const fromNotes = String(notes || '').trim();
  if (fromNotes && !/^[0-9a-f-]{36}$/i.test(fromNotes)) return fromNotes.slice(0, 100);
  const id = String(productId || '').trim();
  if (!id) return fromNotes.slice(0, 100);
  const table = productsTable();
  try {
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./api/postgrestClient');
      const rows = await postgrest.get<{ code?: string }[]>(
        `/${table}`,
        { select: 'code', id: `eq.${id}`, limit: 1 },
        { schema: 'public' },
      );
      return String(rows?.[0]?.code || fromNotes || '').trim().slice(0, 100);
    }
    const { rows } = await postgres.query<{ code: string }>(
      `SELECT code FROM ${table} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return String(rows[0]?.code || fromNotes || '').trim().slice(0, 100);
  } catch {
    return fromNotes.slice(0, 100);
  }
}

export async function pushPendingItemSlipsToLogo(
  cfg?: LogoRestConfig,
  opts: { limit?: number; onLog?: (entry: LogoSyncLogEntry) => void; refreshSession?: boolean } = {},
): Promise<LogoOutboundEntityResult> {
  const config = cfg ?? loadLogoRestConfig();
  if (opts.refreshSession !== false) await logoRefreshSession(config);

  const messages: string[] = [];
  let success = 0;
  let errors = 0;
  const table = stockMovementsTable();
  const limit = opts.limit ?? 20;

  let pending: Record<string, unknown>[] = [];
  try {
    pending = await fetchPendingRows(table, limit);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/logo_sync_status|42703|does not exist/i.test(msg)) {
      messages.push(`Malzeme fişi: logo_sync kolonları yok — migration 113 (${msg})`);
      return { processed: 0, success: 0, errors: 1, messages };
    }
    throw e;
  }

  messages.push(`${pending.length} bekleyen malzeme fişi bulundu.`);

  for (const row of pending) {
    const id = String(row.id || '');
    const docNo = String(row.document_no || id).trim();
    try {
      const lines = id ? await fetchMovementLines(id) : [];
      const trLines = [];
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const code = await resolveProductCode(ln.product_id, ln.notes);
        if (!code) continue;
        trLines.push({
          TYPE: 0,
          MASTER_CODE: code,
          QUANTITY: Number(ln.quantity) || 0,
          PRICE: Number(ln.unit_price) || 0,
          LINE_NO: i + 1,
        });
      }
      const ioType =
        Math.round(Number(row.trcode)) ||
        (String(row.movement_type) === 'in' ? 1 : 2);
      const restRecord = {
        TYPE: ioType,
        NUMBER: docNo.slice(0, 33) || `REX-ST-${id.slice(0, 8)}`,
        DATE: String(row.movement_date || new Date().toISOString()).slice(0, 10),
        NOTES1: String(row.description || 'RetailEX').slice(0, 50),
        TRANSACTIONS: { items: trLines },
      };
      const created = await logoCreateResource(config, 'itemSlips', restRecord);
      const newRef = extractLogoInternalRef(created);
      if (id) await markMasterSync(table, id, 'success', { refId: newRef });
      success += 1;
      opts.onLog?.({
        at: new Date().toISOString(),
        entity: 'stock',
        action: 'create',
        code: docNo,
        detail: newRef ? `Logo ref ${newRef}` : 'itemSlips yazıldı',
        ok: true,
      });
      messages.push(`Malzeme fişi ${docNo} → Logo OK`);
    } catch (e: unknown) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (id) await markMasterSync(table, id, 'error', { error: msg }).catch(() => {});
      opts.onLog?.({
        at: new Date().toISOString(),
        entity: 'stock',
        action: 'error',
        code: docNo,
        detail: msg,
        ok: false,
      });
      messages.push(`Malzeme fişi ${docNo} hata: ${msg}`);
    }
  }

  return { processed: pending.length, success, errors, messages };
}

async function pushDocIf(
  enabled: boolean | undefined,
  kind: LogoDocumentPushKind,
  config: LogoRestConfig,
  limit: number,
  onLog?: (entry: LogoSyncLogEntry) => void,
): Promise<LogoDocumentPushResult> {
  if (enabled === false) return emptyDoc();
  return pushPendingDocumentsToLogo(kind, config, {
    limit,
    onLog,
    refreshSession: false,
  });
}

/** Kartlar + belgeler + stok — PostgREST kuyruk → Logo REST */
export async function pushPendingLogoOutbound(
  cfg?: LogoRestConfig,
  opts: {
    limit?: number;
    onLog?: (entry: LogoSyncLogEntry) => void;
    products?: boolean;
    customers?: boolean;
    suppliers?: boolean;
    banks?: boolean;
    /** @deprecated salesInvoices */
    invoices?: boolean;
    salesInvoices?: boolean;
    purchaseInvoices?: boolean;
    salesOrders?: boolean;
    purchaseOrders?: boolean;
    salesDispatches?: boolean;
    purchaseDispatches?: boolean;
    itemSlips?: boolean;
  } = {},
): Promise<LogoOutboundPushResult> {
  const config = cfg ?? loadLogoRestConfig();
  const limit = opts.limit ?? 25;
  const messages: string[] = [];

  await logoRefreshSession(config);

  const wantSalesInv =
    opts.salesInvoices !== undefined ? opts.salesInvoices !== false : opts.invoices !== false;

  const products =
    opts.products === false
      ? emptyEntity()
      : await pushPendingProductsToLogo(config, {
          limit,
          onLog: opts.onLog,
          refreshSession: false,
        });
  const customers =
    opts.customers === false
      ? emptyEntity()
      : await pushPendingCustomersToLogo(config, {
          limit,
          onLog: opts.onLog,
          refreshSession: false,
        });
  const suppliers =
    opts.suppliers === false
      ? emptyEntity()
      : await pushPendingSuppliersToLogo(config, {
          limit,
          onLog: opts.onLog,
          refreshSession: false,
        });
  const banks =
    opts.banks === true
      ? await pushPendingBanksToLogo(config, {
          limit,
          onLog: opts.onLog,
          refreshSession: false,
        })
      : emptyEntity();

  const invoices = await pushDocIf(wantSalesInv, 'salesInvoices', config, limit, opts.onLog);
  const purchaseInvoices = await pushDocIf(
    opts.purchaseInvoices === true,
    'purchaseInvoices',
    config,
    limit,
    opts.onLog,
  );
  const salesOrders = await pushDocIf(
    opts.salesOrders === true,
    'salesOrders',
    config,
    limit,
    opts.onLog,
  );
  const purchaseOrders = await pushDocIf(
    opts.purchaseOrders === true,
    'purchaseOrders',
    config,
    limit,
    opts.onLog,
  );
  const salesDispatches = await pushDocIf(
    opts.salesDispatches === true,
    'salesDispatches',
    config,
    limit,
    opts.onLog,
  );
  const purchaseDispatches = await pushDocIf(
    opts.purchaseDispatches === true,
    'purchaseDispatches',
    config,
    limit,
    opts.onLog,
  );
  const itemSlips =
    opts.itemSlips === true
      ? await pushPendingItemSlipsToLogo(config, {
          limit,
          onLog: opts.onLog,
          refreshSession: false,
        })
      : emptyEntity();

  const parts = [
    products,
    customers,
    suppliers,
    banks,
    invoices,
    purchaseInvoices,
    salesOrders,
    purchaseOrders,
    salesDispatches,
    purchaseDispatches,
    itemSlips,
  ];
  for (const p of parts) messages.push(...p.messages);

  return {
    products,
    customers,
    suppliers,
    banks,
    invoices,
    purchaseInvoices,
    salesOrders,
    purchaseOrders,
    salesDispatches,
    purchaseDispatches,
    itemSlips,
    messages,
    success: parts.reduce((s, p) => s + p.success, 0),
    errors: parts.reduce((s, p) => s + p.errors, 0),
  };
}

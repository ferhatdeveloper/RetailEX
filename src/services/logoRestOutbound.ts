/**
 * RetailEX (PostgREST / PG) → Logo Tiger REST giden yazım.
 * Bekleyen ürün (items), cari (Arps), fatura (salesInvoices) kayıtlarını işler.
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
import { pushPendingSalesToLogo, type LogoInvoicePushResult } from './logoRestInvoicePush';
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
  invoices: LogoInvoicePushResult;
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
    resource: 'items' | 'Arps';
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
        await markMasterSync(opts.table, id, 'success', { refId: newRef });
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

/** Ürün + cari + fatura — PostgREST kuyruk → Logo REST */
export async function pushPendingLogoOutbound(
  cfg?: LogoRestConfig,
  opts: {
    limit?: number;
    onLog?: (entry: LogoSyncLogEntry) => void;
    products?: boolean;
    customers?: boolean;
    suppliers?: boolean;
    invoices?: boolean;
  } = {},
): Promise<LogoOutboundPushResult> {
  const config = cfg ?? loadLogoRestConfig();
  const limit = opts.limit ?? 25;
  const messages: string[] = [];

  await logoRefreshSession(config);

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
  const invoices =
    opts.invoices === false
      ? { processed: 0, success: 0, errors: 0, messages: [] }
      : await pushPendingSalesToLogo(config, {
          limit,
          onLog: opts.onLog,
          refreshSession: false,
        });

  messages.push(...products.messages, ...customers.messages, ...suppliers.messages, ...invoices.messages);

  return {
    products,
    customers,
    suppliers,
    invoices,
    messages,
    success: products.success + customers.success + suppliers.success + invoices.success,
    errors: products.errors + customers.errors + suppliers.errors + invoices.errors,
  };
}

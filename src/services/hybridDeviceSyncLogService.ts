/**
 * Hibrit senkron — cihaz bazlı aktarım logu, watermark cursor, fiyat alanı özeti.
 */

import { IS_TAURI } from '../utils/env';
import { ERP_SETTINGS, LOCAL_CONFIG } from './postgres';
import { queryPgRows } from './hybridSyncEngine';

export const PRODUCT_PRICE_FIELDS = [
  'price',
  'cost',
  'purchase_price',
  'price_list_1',
  'price_list_2',
  'price_list_3',
  'price_list_4',
  'price_list_5',
  'price_list_6',
  'pricelist1',
  'pricelist2',
  'pricelist3',
  'pricelist4',
  'pricelist5',
  'pricelist6',
  'sale_price_usd',
  'sale_price_eur',
  'purchase_price_usd',
  'purchase_price_eur',
  'custom_exchange_rate',
] as const;

export type DeviceSyncScope =
  | 'hybrid_outbound'
  | 'hybrid_inbound'
  | 'products'
  | 'customers'
  | 'suppliers';

export type DeviceSyncDirection = 'local_to_remote' | 'remote_to_local';

export type TableBreakdownRow = { tableName: string; count: number };

export type PriceFieldDiff = {
  field: string;
  old: unknown;
  new: unknown;
};

export type PriceChangeSnapshot = {
  tableName: string;
  recordId: string;
  code?: string;
  name?: string;
  /** Uygulama sonrası fiyat alanları (geriye dönük uyumluluk) */
  prices: Record<string, unknown>;
  oldPrices?: Record<string, unknown>;
  newPrices?: Record<string, unknown>;
  priceDiff?: PriceFieldDiff[];
  updatedAt?: string;
};

export type DeviceSyncTransferLogRow = {
  id: string;
  deviceId: string;
  firmNr: string;
  direction: DeviceSyncDirection;
  syncMode: string;
  status: string;
  recordCount: number;
  priceChangeCount: number;
  watermarkFrom: string | null;
  watermarkTo: string | null;
  tableBreakdown: TableBreakdownRow[];
  message: string | null;
  createdAt: number;
};

function firmNrPadded(raw?: string): string {
  return String(raw || ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

/** Kalıcı cihaz kimliği (web localStorage / Tauri config). */
export async function getHybridDeviceId(): Promise<string> {
  if (IS_TAURI) {
    try {
      const { safeInvoke } = await import('../utils/env');
      const cfg = (await safeInvoke('get_app_config')) as { device_id?: string };
      const id = String(cfg?.device_id ?? '').trim();
      if (id) return id;
    } catch {
      /* fallback */
    }
  }
  if (typeof window !== 'undefined') {
    try {
      let deviceId = window.localStorage.getItem('retailex_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        window.localStorage.setItem('retailex_device_id', deviceId);
      }
      return deviceId;
    } catch {
      /* ignore */
    }
  }
  return 'RE-GLOBAL-001';
}

export function extractProductPriceSnapshot(
  tableName: string,
  recordId: string,
  data: Record<string, unknown>,
): PriceChangeSnapshot | null {
  if (!/_products$/i.test(tableName)) return null;
  const prices: Record<string, unknown> = {};
  for (const key of PRODUCT_PRICE_FIELDS) {
    if (key in data && data[key] !== null && data[key] !== undefined) {
      prices[key] = data[key];
    }
  }
  if (Object.keys(prices).length === 0) return null;
  return {
    tableName,
    recordId,
    code: data.code != null ? String(data.code) : undefined,
    name: data.name != null ? String(data.name) : undefined,
    prices,
    updatedAt: data.updated_at != null ? String(data.updated_at) : undefined,
  };
}

export function buildTableBreakdown(
  items: Array<{ table_name: string }>,
): TableBreakdownRow[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const t = String(item.table_name || '');
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([tableName, count]) => ({ tableName, count }))
    .sort((a, b) => b.count - a.count);
}

export function collectPriceSnapshotsFromQueueItems(
  items: Array<{ table_name: string; record_id: string; data: Record<string, unknown> | null }>,
  limit = 50,
): PriceChangeSnapshot[] {
  const out: PriceChangeSnapshot[] = [];
  for (const item of items) {
    if (!item.data || typeof item.data !== 'object') continue;
    const snap = extractProductPriceSnapshot(item.table_name, item.record_id, item.data);
    if (snap) out.push(snap);
    if (out.length >= limit) break;
  }
  return out;
}

export async function getDeviceSyncCursor(
  deviceId: string,
  scope: DeviceSyncScope,
  firmNr?: string,
): Promise<{ watermark: string | null; lastSuccess: string | null }> {
  const firm = firmNrPadded(firmNr);
  try {
    const rows = await queryPgRows(
      LOCAL_CONFIG,
      `SELECT last_watermark_at::text, last_success_at::text
       FROM device_sync_cursor
       WHERE device_id = $1 AND firm_nr = $2 AND scope = $3
       LIMIT 1`,
      [deviceId, firm, scope],
    );
    const row = rows[0] as { last_watermark_at?: string; last_success_at?: string } | undefined;
    return {
      watermark: row?.last_watermark_at ?? null,
      lastSuccess: row?.last_success_at ?? null,
    };
  } catch {
    return { watermark: null, lastSuccess: null };
  }
}

export async function upsertDeviceSyncCursor(opts: {
  deviceId: string;
  scope: DeviceSyncScope;
  firmNr?: string;
  syncMode?: 'full' | 'incremental';
  watermarkTo?: string | null;
}): Promise<void> {
  const firm = firmNrPadded(opts.firmNr);
  const now = new Date().toISOString();
  try {
    await queryPgRows(
      LOCAL_CONFIG,
      `INSERT INTO device_sync_cursor (device_id, firm_nr, scope, last_success_at, last_watermark_at, sync_mode, updated_at)
       VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, NOW())
       ON CONFLICT (device_id, firm_nr, scope) DO UPDATE SET
         last_success_at = EXCLUDED.last_success_at,
         last_watermark_at = COALESCE(EXCLUDED.last_watermark_at, device_sync_cursor.last_watermark_at),
         sync_mode = EXCLUDED.sync_mode,
         updated_at = NOW()`,
      [
        opts.deviceId,
        firm,
        opts.scope,
        now,
        opts.watermarkTo ?? now,
        opts.syncMode ?? 'incremental',
      ],
    );
  } catch {
    /* migration 083 yok */
  }
}

export async function logDeviceSyncTransfer(opts: {
  deviceId: string;
  direction: DeviceSyncDirection;
  syncMode?: 'full' | 'incremental';
  firmNr?: string;
  storeId?: string | null;
  terminalName?: string | null;
  status?: 'ok' | 'failed' | 'partial';
  recordCount?: number;
  insertedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  priceChangeCount?: number;
  watermarkFrom?: string | null;
  watermarkTo?: string | null;
  tableBreakdown?: TableBreakdownRow[];
  priceChanges?: PriceChangeSnapshot[];
  message?: string | null;
  detail?: Record<string, unknown>;
}): Promise<string | null> {
  const firm = firmNrPadded(opts.firmNr);
  try {
    const rows = await queryPgRows(
      LOCAL_CONFIG,
      `INSERT INTO device_sync_transfer_log (
         device_id, firm_nr, store_id, terminal_name, direction, sync_mode, status,
         record_count, inserted_count, updated_count, skipped_count, failed_count,
         price_change_count, watermark_from, watermark_to,
         table_breakdown, price_changes, message, detail
       ) VALUES (
         $1, $2, $3::uuid, $4, $5, $6, $7,
         $8, $9, $10, $11, $12,
         $13, $14::timestamptz, $15::timestamptz,
         $16::jsonb, $17::jsonb, $18, $19::jsonb
       ) RETURNING id::text`,
      [
        opts.deviceId,
        firm,
        opts.storeId ?? null,
        opts.terminalName ?? null,
        opts.direction,
        opts.syncMode ?? 'incremental',
        opts.status ?? 'ok',
        opts.recordCount ?? 0,
        opts.insertedCount ?? 0,
        opts.updatedCount ?? 0,
        opts.skippedCount ?? 0,
        opts.failedCount ?? 0,
        opts.priceChangeCount ?? 0,
        opts.watermarkFrom ?? null,
        opts.watermarkTo ?? null,
        JSON.stringify(opts.tableBreakdown ?? []),
        JSON.stringify(opts.priceChanges ?? []),
        opts.message ?? null,
        JSON.stringify(opts.detail ?? {}),
      ],
    );
    return String((rows[0] as { id?: string })?.id ?? '') || null;
  } catch {
    return null;
  }
}

export async function listDeviceSyncTransferLogs(opts?: {
  deviceId?: string;
  limit?: number;
}): Promise<DeviceSyncTransferLogRow[]> {
  const limit = Math.min(opts?.limit ?? 20, 100);
  const params: unknown[] = [];
  let where = '1=1';
  if (opts?.deviceId) {
    params.push(opts.deviceId);
    where += ` AND device_id = $${params.length}`;
  }
  params.push(limit);
  try {
    const rows = await queryPgRows(
      LOCAL_CONFIG,
      `SELECT id::text, device_id, firm_nr, direction, sync_mode, status,
              record_count, price_change_count,
              watermark_from::text, watermark_to::text,
              table_breakdown, message,
              EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms
       FROM device_sync_transfer_log
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      deviceId: String(r.device_id),
      firmNr: String(r.firm_nr),
      direction: r.direction as DeviceSyncDirection,
      syncMode: String(r.sync_mode),
      status: String(r.status),
      recordCount: Number(r.record_count ?? 0),
      priceChangeCount: Number(r.price_change_count ?? 0),
      watermarkFrom: r.watermark_from ? String(r.watermark_from) : null,
      watermarkTo: r.watermark_to ? String(r.watermark_to) : null,
      tableBreakdown: Array.isArray(r.table_breakdown)
        ? (r.table_breakdown as TableBreakdownRow[])
        : [],
      message: r.message ? String(r.message) : null,
      createdAt: Number(r.created_at_ms ?? Date.now()),
    }));
  } catch {
    return [];
  }
}

export function formatDeviceSyncLogSummary(log: DeviceSyncTransferLogRow): string {
  const parts = log.tableBreakdown.slice(0, 3).map((r) => {
    const short = r.tableName.replace(/^rex_\d+_/i, '');
    return `${short}(${r.count})`;
  });
  const tables = parts.length ? parts.join(' · ') : `${log.recordCount} kayıt`;
  const price =
    log.priceChangeCount > 0 ? ` · fiyat ${log.priceChangeCount}` : '';
  return `${log.direction === 'local_to_remote' ? 'Gönder' : 'Al'}: ${tables}${price}`;
}

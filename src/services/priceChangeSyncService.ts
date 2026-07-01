/**
 * Fiyat değişimi: eski/yeni karşılaştırma, cihaz teslim onayı (merkez), teslimat durumu.
 */

import { getPostgrestBaseUrl } from '../config/postgrest.config';
import { fetchRetailexAware } from '../utils/retailexDevProxy';
import { ERP_SETTINGS, LOCAL_CONFIG } from './postgres';
import { queryPgRows, type PgEndpointConfig } from './hybridSyncEngine';
import { PRODUCT_PRICE_FIELDS } from './hybridDeviceSyncLogService';

export type PriceFieldDiff = {
  field: string;
  old: unknown;
  new: unknown;
};

export type ProductPriceAckPayload = {
  priceChangeLogId?: string | null;
  deviceId: string;
  storeId?: string | null;
  terminalName?: string | null;
  firmNr: string;
  tableName: string;
  recordId: string;
  productCode?: string;
  oldPrices: Record<string, unknown>;
  newPrices: Record<string, unknown>;
  priceDiff: PriceFieldDiff[];
};

export type PriceChangeLogRow = {
  id: string;
  firmNr: string;
  tableName: string;
  recordId: string;
  productCode: string | null;
  productName: string | null;
  oldPrices: Record<string, unknown>;
  newPrices: Record<string, unknown>;
  priceDiff: PriceFieldDiff[];
  changedAt: string;
};

export type RegisteredDeviceRow = {
  deviceId: string;
  terminalName: string;
  storeId: string | null;
  storeName: string | null;
};

export type PriceDeliveryStatusRow = {
  priceChange: PriceChangeLogRow;
  ackedDeviceIds: string[];
  missingDeviceIds: string[];
  allDevices: RegisteredDeviceRow[];
};

function firmNrPadded(raw?: string): string {
  return String(raw || ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

export function extractPriceFields(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!data) return out;
  for (const key of PRODUCT_PRICE_FIELDS) {
    if (key in data && data[key] !== null && data[key] !== undefined) {
      out[key] = data[key];
    }
  }
  return out;
}

export function comparePriceFields(
  oldData: Record<string, unknown> | null | undefined,
  newData: Record<string, unknown> | null | undefined,
): PriceFieldDiff[] {
  const oldP = extractPriceFields(oldData ?? {});
  const newP = extractPriceFields(newData ?? {});
  const keys = new Set([...Object.keys(oldP), ...Object.keys(newP)]);
  const diffs: PriceFieldDiff[] = [];
  for (const field of keys) {
    const o = oldP[field];
    const n = newP[field];
    if (String(o ?? '') !== String(n ?? '')) {
      diffs.push({ field, old: o ?? null, new: n ?? null });
    }
  }
  return diffs;
}

function isSafeTableName(tableName: string): boolean {
  return /^rex_\d{3}_[a-z0-9_]+$/i.test(tableName);
}

/** Yerel PG'deki mevcut ürün fiyat alanları */
export async function fetchLocalProductPriceFields(
  pg: PgEndpointConfig,
  tableName: string,
  recordId: string,
): Promise<Record<string, unknown> | null> {
  if (!isSafeTableName(tableName) || !/_products$/i.test(tableName)) return null;
  try {
    const cols = PRODUCT_PRICE_FIELDS.map((c) => `"${c}"`).join(', ');
    const rows = await queryPgRows(
      pg,
      `SELECT code, name, ${cols} FROM ${tableName} WHERE id = $1::uuid LIMIT 1`,
      [recordId],
    );
    if (!rows[0]) return null;
    return rows[0] as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Merkez PostgREST: son fiyat değişim kaydı */
export async function fetchLatestPriceChangeLogForRecord(
  recordId: string,
): Promise<PriceChangeLogRow | null> {
  const base = getPostgrestBaseUrl().replace(/\/+$/, '');
  if (!base) return null;
  const url = `${base}/price_change_log?record_id=eq.${encodeURIComponent(recordId)}&order=changed_at.desc&limit=1`;
  try {
    const res = await fetchRetailexAware(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Accept-Profile': 'public' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<Record<string, unknown>>;
    const row = data[0];
    if (!row) return null;
    return mapPriceChangeLogRow(row);
  } catch {
    return null;
  }
}

function mapPriceChangeLogRow(row: Record<string, unknown>): PriceChangeLogRow {
  return {
    id: String(row.id),
    firmNr: String(row.firm_nr ?? ''),
    tableName: String(row.table_name ?? ''),
    recordId: String(row.record_id ?? ''),
    productCode: row.product_code ? String(row.product_code) : null,
    productName: row.product_name ? String(row.product_name) : null,
    oldPrices: (row.old_prices as Record<string, unknown>) ?? {},
    newPrices: (row.new_prices as Record<string, unknown>) ?? {},
    priceDiff: Array.isArray(row.price_diff) ? (row.price_diff as PriceFieldDiff[]) : [],
    changedAt: String(row.changed_at ?? ''),
  };
}

/** Cihaz alım sonrası merkeze teslim onayı yazar */
export async function pushDevicePriceAcksToCenter(acks: ProductPriceAckPayload[]): Promise<number> {
  if (!acks.length) return 0;
  const base = getPostgrestBaseUrl().replace(/\/+$/, '');
  if (!base) return 0;

  let ok = 0;
  for (const ack of acks) {
    const body = {
      price_change_log_id: ack.priceChangeLogId || null,
      device_id: ack.deviceId,
      store_id: ack.storeId || null,
      terminal_name: ack.terminalName || null,
      firm_nr: ack.firmNr,
      table_name: ack.tableName,
      record_id: ack.recordId,
      product_code: ack.productCode || null,
      old_prices: ack.oldPrices,
      new_prices: ack.newPrices,
      price_diff: ack.priceDiff,
    };
    try {
      const res = await fetchRetailexAware(`${base}/device_price_ack`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Profile': 'public',
          'Content-Profile': 'public',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(body),
      });
      if (res.ok || res.status === 409) ok += 1;
    } catch {
      /* tek ack atla */
    }
  }
  return ok;
}

/** Merkez: kayıtlı kasa/terminal cihazları */
export async function listRegisteredSyncDevices(firmNr?: string): Promise<RegisteredDeviceRow[]> {
  const firm = firmNrPadded(firmNr);
  const base = getPostgrestBaseUrl().replace(/\/+$/, '');
  if (!base) return [];
  try {
    const url = `${base}/pos_terminal_registrations?firm_nr=eq.${encodeURIComponent(firm)}&status=eq.approved&select=device_id,terminal_name,store_id,stores(name)`;
    const res = await fetchRetailexAware(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Accept-Profile': 'public' },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      deviceId: String(r.device_id ?? ''),
      terminalName: String(r.terminal_name ?? ''),
      storeId: r.store_id ? String(r.store_id) : null,
      storeName:
        r.stores && typeof r.stores === 'object' && r.stores !== null && 'name' in (r.stores as object)
          ? String((r.stores as { name?: string }).name ?? '')
          : null,
    }));
  } catch {
    return [];
  }
}

/** Merkez: son fiyat değişimleri + hangi cihaz aldı/alamadı */
export async function getPriceDeliveryStatus(opts?: {
  firmNr?: string;
  limit?: number;
  hours?: number;
}): Promise<PriceDeliveryStatusRow[]> {
  const firm = firmNrPadded(opts?.firmNr);
  const limit = Math.min(opts?.limit ?? 30, 100);
  const hours = opts?.hours ?? 168;
  const base = getPostgrestBaseUrl().replace(/\/+$/, '');
  if (!base) return [];

  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const devices = await listRegisteredSyncDevices(firm);
  const deviceIds = devices.map((d) => d.deviceId).filter(Boolean);

  try {
    const logUrl = `${base}/price_change_log?firm_nr=eq.${encodeURIComponent(firm)}&changed_at=gte.${encodeURIComponent(since)}&order=changed_at.desc&limit=${limit}`;
    const logRes = await fetchRetailexAware(logUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Accept-Profile': 'public' },
    });
    if (!logRes.ok) return [];
    const logs = ((await logRes.json()) as Array<Record<string, unknown>>).map(mapPriceChangeLogRow);
    if (!logs.length) return [];

    const logIds = logs.map((l) => l.id).join(',');
    const ackUrl = `${base}/device_price_ack?price_change_log_id=in.(${logIds})&select=price_change_log_id,device_id`;
    const ackRes = await fetchRetailexAware(ackUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Accept-Profile': 'public' },
    });
    const ackRows = ackRes.ok ? ((await ackRes.json()) as Array<Record<string, unknown>>) : [];
    const ackMap = new Map<string, Set<string>>();
    for (const a of ackRows) {
      const lid = String(a.price_change_log_id ?? '');
      const did = String(a.device_id ?? '');
      if (!lid || !did) continue;
      if (!ackMap.has(lid)) ackMap.set(lid, new Set());
      ackMap.get(lid)!.add(did);
    }

    return logs.map((priceChange) => {
      const acked = [...(ackMap.get(priceChange.id) ?? new Set())];
      const missing = deviceIds.filter((id) => !acked.includes(id));
      return {
        priceChange,
        ackedDeviceIds: acked,
        missingDeviceIds: missing,
        allDevices: devices,
      };
    });
  } catch {
    return [];
  }
}

export function formatPriceDiffShort(diffs: PriceFieldDiff[]): string {
  if (!diffs.length) return '—';
  return diffs
    .slice(0, 3)
    .map((d) => `${d.field}: ${d.old ?? '—'} → ${d.new ?? '—'}`)
    .join(' · ');
}

export function deviceLabel(deviceId: string, devices: RegisteredDeviceRow[]): string {
  const d = devices.find((x) => x.deviceId === deviceId);
  if (!d) return deviceId.slice(0, 8);
  return d.terminalName || d.deviceId.slice(0, 8);
}

/**
 * Merkez cihaz senkron onayı: alım/gönderim oturumu bildirimi + merkez panel sorguları.
 */

import { getPostgrestBaseUrl } from '../config/postgrest.config';
import { APP_SEMVER } from '../core/version';
import { fetchRetailexAware } from '../utils/retailexDevProxy';
import { ERP_SETTINGS } from './postgres';
import type { DeviceSyncDirection } from './hybridDeviceSyncLogService';
import type { PriceChangeSnapshot, TableBreakdownRow } from './hybridDeviceSyncLogService';
import { formatPriceDiffShort, type PriceFieldDiff } from './priceChangeSyncService';
import {
  fetchStoreDevicesPresence,
  resolveDeviceOnlineStatus,
  type ResolvedDeviceOnline,
  type StoreDevicePresenceRow,
} from './deviceOnlineStatusService';

export type DeviceSyncAckPayload = {
  deviceId: string;
  firmNr: string;
  storeId?: string | null;
  terminalName?: string | null;
  direction: DeviceSyncDirection;
  syncMode?: 'full' | 'incremental';
  status?: 'ok' | 'partial' | 'failed';
  recordCount?: number;
  insertedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  priceChangeCount?: number;
  priceAckCount?: number;
  pendingPriceCount?: number;
  productsWithPrice?: number;
  tableBreakdown?: TableBreakdownRow[];
  priceChanges?: PriceChangeSnapshot[];
  watermarkFrom?: string | null;
  watermarkTo?: string | null;
  appVersion?: string;
  message?: string | null;
  detail?: Record<string, unknown>;
  localLogId?: string | null;
};

export type DeviceSyncAckRow = {
  id: string;
  deviceId: string;
  firmNr: string;
  storeId: string | null;
  terminalName: string | null;
  direction: DeviceSyncDirection;
  syncMode: string;
  status: string;
  recordCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  priceChangeCount: number;
  priceAckCount: number;
  pendingPriceCount: number;
  productsWithPrice: number;
  tableBreakdown: TableBreakdownRow[];
  priceChanges: PriceChangeSnapshot[];
  watermarkFrom: string | null;
  watermarkTo: string | null;
  appVersion: string | null;
  message: string | null;
  ackAt: string;
};

export type RegisteredTerminalRow = {
  deviceId: string;
  terminalName: string;
  storeId: string | null;
  storeName: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  approvedAt: string | null;
  hostname: string | null;
  computerName: string | null;
};

export type CenterDeviceOverviewRow = {
  device: RegisteredTerminalRow;
  lastInbound: DeviceSyncAckRow | null;
  lastOutbound: DeviceSyncAckRow | null;
  pendingPriceChanges: number;
  recentPriceAckCount: number;
  riskLevel: 'ok' | 'warning' | 'critical';
  online: ResolvedDeviceOnline;
  wsPresence: StoreDevicePresenceRow | null;
};

function firmNrPadded(raw?: string): string {
  return String(raw || ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

function restBase(): string {
  return getPostgrestBaseUrl().replace(/\/+$/, '');
}

function mapAckRow(row: Record<string, unknown>): DeviceSyncAckRow {
  return {
    id: String(row.id),
    deviceId: String(row.device_id ?? ''),
    firmNr: String(row.firm_nr ?? ''),
    storeId: row.store_id ? String(row.store_id) : null,
    terminalName: row.terminal_name ? String(row.terminal_name) : null,
    direction: String(row.direction ?? '') as DeviceSyncDirection,
    syncMode: String(row.sync_mode ?? 'incremental'),
    status: String(row.status ?? 'ok'),
    recordCount: Number(row.record_count ?? 0),
    insertedCount: Number(row.inserted_count ?? 0),
    updatedCount: Number(row.updated_count ?? 0),
    skippedCount: Number(row.skipped_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    priceChangeCount: Number(row.price_change_count ?? 0),
    priceAckCount: Number(row.price_ack_count ?? 0),
    pendingPriceCount: Number(row.pending_price_count ?? 0),
    productsWithPrice: Number(row.products_with_price ?? 0),
    tableBreakdown: Array.isArray(row.table_breakdown)
      ? (row.table_breakdown as TableBreakdownRow[])
      : [],
    priceChanges: Array.isArray(row.price_changes)
      ? (row.price_changes as PriceChangeSnapshot[])
      : [],
    watermarkFrom: row.watermark_from ? String(row.watermark_from) : null,
    watermarkTo: row.watermark_to ? String(row.watermark_to) : null,
    appVersion: row.app_version ? String(row.app_version) : null,
    message: row.message ? String(row.message) : null,
    ackAt: String(row.ack_at ?? ''),
  };
}

/** Alım/gönderim oturumu bitince merkeze bildir */
export async function pushDeviceSyncAckToCenter(payload: DeviceSyncAckPayload): Promise<boolean> {
  const base = restBase();
  if (!base) return false;

  const body = {
    device_id: payload.deviceId,
    firm_nr: firmNrPadded(payload.firmNr),
    store_id: payload.storeId || null,
    terminal_name: payload.terminalName || null,
    direction: payload.direction,
    sync_mode: payload.syncMode ?? 'incremental',
    status: payload.status ?? 'ok',
    record_count: payload.recordCount ?? 0,
    inserted_count: payload.insertedCount ?? 0,
    updated_count: payload.updatedCount ?? 0,
    skipped_count: payload.skippedCount ?? 0,
    failed_count: payload.failedCount ?? 0,
    price_change_count: payload.priceChangeCount ?? 0,
    price_ack_count: payload.priceAckCount ?? 0,
    pending_price_count: payload.pendingPriceCount ?? 0,
    products_with_price: payload.productsWithPrice ?? 0,
    table_breakdown: payload.tableBreakdown ?? [],
    price_changes: payload.priceChanges ?? [],
    watermark_from: payload.watermarkFrom || null,
    watermark_to: payload.watermarkTo || null,
    app_version: payload.appVersion ?? APP_SEMVER,
    message: payload.message || null,
    detail: payload.detail ?? {},
    local_log_id: payload.localLogId || null,
  };

  try {
    const res = await fetchRetailexAware(`${base}/device_sync_ack`, {
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
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}

/** Merkez: kayıtlı terminaller (genişletilmiş) */
export async function listRegisteredTerminals(firmNr?: string): Promise<RegisteredTerminalRow[]> {
  const firm = firmNrPadded(firmNr);
  const base = restBase();
  if (!base) return [];
  try {
    const url =
      `${base}/pos_terminal_registrations?firm_nr=eq.${encodeURIComponent(firm)}` +
      '&status=eq.approved&select=device_id,terminal_name,store_id,stores(name),app_version,last_seen_at,approved_at,hostname,computer_name';
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
      appVersion: r.app_version ? String(r.app_version) : null,
      lastSeenAt: r.last_seen_at ? String(r.last_seen_at) : null,
      approvedAt: r.approved_at ? String(r.approved_at) : null,
      hostname: r.hostname ? String(r.hostname) : null,
      computerName: r.computer_name ? String(r.computer_name) : null,
    }));
  } catch {
    return [];
  }
}

async function fetchAckSessions(opts: {
  firmNr: string;
  direction?: DeviceSyncDirection;
  limit?: number;
  hours?: number;
}): Promise<DeviceSyncAckRow[]> {
  const base = restBase();
  if (!base) return [];
  const limit = Math.min(opts.limit ?? 50, 200);
  const hours = opts.hours ?? 168;
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  let url =
    `${base}/device_sync_ack?firm_nr=eq.${encodeURIComponent(opts.firmNr)}` +
    `&ack_at=gte.${encodeURIComponent(since)}&order=ack_at.desc&limit=${limit}`;
  if (opts.direction) {
    url += `&direction=eq.${encodeURIComponent(opts.direction)}`;
  }
  try {
    const res = await fetchRetailexAware(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Accept-Profile': 'public' },
    });
    if (!res.ok) return [];
    return ((await res.json()) as Array<Record<string, unknown>>).map(mapAckRow);
  } catch {
    return [];
  }
}

/** Cihaz başına bekleyen fiyat değişimi sayısı */
export async function countPendingPriceChangesByDevice(
  firmNr?: string,
  hours = 168,
): Promise<Map<string, number>> {
  const firm = firmNrPadded(firmNr);
  const base = restBase();
  const out = new Map<string, number>();
  if (!base) return out;

  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const devices = await listRegisteredTerminals(firm);
  for (const d of devices) out.set(d.deviceId, 0);

  try {
    const logUrl =
      `${base}/price_change_log?firm_nr=eq.${encodeURIComponent(firm)}` +
      `&changed_at=gte.${encodeURIComponent(since)}&select=id&order=changed_at.desc&limit=500`;
    const logRes = await fetchRetailexAware(logUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Accept-Profile': 'public' },
    });
    if (!logRes.ok) return out;
    const logs = (await logRes.json()) as Array<{ id?: string }>;
    const logIds = logs.map((l) => String(l.id ?? '')).filter(Boolean);
    if (!logIds.length) return out;

    const ackUrl =
      `${base}/device_price_ack?price_change_log_id=in.(${logIds.join(',')})` +
      '&select=price_change_log_id,device_id';
    const ackRes = await fetchRetailexAware(ackUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Accept-Profile': 'public' },
    });
    const ackRows = ackRes.ok
      ? ((await ackRes.json()) as Array<{ price_change_log_id?: string; device_id?: string }>)
      : [];

    const ackedByDevice = new Map<string, Set<string>>();
    for (const a of ackRows) {
      const did = String(a.device_id ?? '');
      const lid = String(a.price_change_log_id ?? '');
      if (!did || !lid) continue;
      if (!ackedByDevice.has(did)) ackedByDevice.set(did, new Set());
      ackedByDevice.get(did)!.add(lid);
    }

    for (const device of devices) {
      const acked = ackedByDevice.get(device.deviceId) ?? new Set();
      const pending = logIds.filter((id) => !acked.has(id)).length;
      out.set(device.deviceId, pending);
    }
  } catch {
    /* merkez erişilemez */
  }
  return out;
}

function latestAckByDevice(
  sessions: DeviceSyncAckRow[],
  direction: DeviceSyncDirection,
): Map<string, DeviceSyncAckRow> {
  const map = new Map<string, DeviceSyncAckRow>();
  for (const s of sessions) {
    if (s.direction !== direction) continue;
    if (!map.has(s.deviceId)) map.set(s.deviceId, s);
  }
  return map;
}

function computeRiskLevel(
  pendingPrices: number,
  lastInbound: DeviceSyncAckRow | null,
  hoursStale: number,
): 'ok' | 'warning' | 'critical' {
  if (pendingPrices >= 5) return 'critical';
  if (pendingPrices > 0) return 'warning';
  if (!lastInbound) return 'warning';
  const ackMs = Date.parse(lastInbound.ackAt);
  if (!Number.isFinite(ackMs)) return 'warning';
  const staleMs = hoursStale * 3600000;
  if (Date.now() - ackMs > staleMs) return 'warning';
  return 'ok';
}

/** Merkez panel: cihaz listesi + son alım + fiyat özeti */
export async function getCenterDeviceSyncOverview(opts?: {
  firmNr?: string;
  hours?: number;
  staleHours?: number;
}): Promise<CenterDeviceOverviewRow[]> {
  const firm = firmNrPadded(opts?.firmNr);
  const hours = opts?.hours ?? 168;
  const staleHours = opts?.staleHours ?? 24;

  const [devices, inboundSessions, outboundSessions, pendingMap, wsPresenceList] =
    await Promise.all([
      listRegisteredTerminals(firm),
      fetchAckSessions({ firmNr: firm, direction: 'remote_to_local', hours, limit: 200 }),
      fetchAckSessions({ firmNr: firm, direction: 'local_to_remote', hours, limit: 100 }),
      countPendingPriceChangesByDevice(firm, hours),
      fetchStoreDevicesPresence(),
    ]);

  const wsMap = new Map(wsPresenceList.map((p) => [p.deviceId, p]));

  const lastInbound = latestAckByDevice(inboundSessions, 'remote_to_local');
  const lastOutbound = latestAckByDevice(outboundSessions, 'local_to_remote');

  const priceAckCounts = new Map<string, number>();
  for (const s of inboundSessions) {
    priceAckCounts.set(s.deviceId, (priceAckCounts.get(s.deviceId) ?? 0) + s.priceAckCount);
  }

  return devices.map((device) => {
    const inbound = lastInbound.get(device.deviceId) ?? null;
    const outbound = lastOutbound.get(device.deviceId) ?? null;
    const pending = pendingMap.get(device.deviceId) ?? 0;
    const wsPresence = wsMap.get(device.deviceId) ?? null;
    const fallbackMs = Math.max(
      device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0,
      inbound?.ackAt ? Date.parse(inbound.ackAt) : 0,
    );
    const online = resolveDeviceOnlineStatus({
      wsPresence,
      fallbackLastSeenMs: Number.isFinite(fallbackMs) && fallbackMs > 0 ? fallbackMs : null,
    });
    return {
      device,
      lastInbound: inbound,
      lastOutbound: outbound,
      pendingPriceChanges: pending,
      recentPriceAckCount: priceAckCounts.get(device.deviceId) ?? 0,
      riskLevel: computeRiskLevel(pending, inbound, staleHours),
      online,
      wsPresence,
    };
  });
}

/** Son alım oturumları (tüm cihazlar) */
export async function getRecentInboundAckSessions(opts?: {
  firmNr?: string;
  limit?: number;
  hours?: number;
}): Promise<DeviceSyncAckRow[]> {
  return fetchAckSessions({
    firmNr: firmNrPadded(opts?.firmNr),
    direction: 'remote_to_local',
    limit: opts?.limit ?? 30,
    hours: opts?.hours ?? 168,
  });
}

export function formatAckRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 48) return `${diffH} sa önce`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} gün önce`;
}

export function formatTableBreakdownShort(rows: TableBreakdownRow[]): string {
  if (!rows.length) return '—';
  return rows
    .slice(0, 4)
    .map((r) => {
      const short = r.tableName.replace(/^rex_\d{3}_/i, '').replace(/_/g, ' ');
      return `${short}(${r.count})`;
    })
    .join(' · ');
}

export function summarizePriceChanges(changes: PriceChangeSnapshot[], limit = 3): string {
  if (!changes.length) return 'Fiyat değişimi yok';
  return changes
    .slice(0, limit)
    .map((c) => {
      const label = c.code || c.name || c.recordId.slice(0, 8);
      const diff = c.priceDiff?.length
        ? formatPriceDiffShort(c.priceDiff as PriceFieldDiff[])
        : '';
      return diff ? `${label}: ${diff}` : label;
    })
    .join(' · ');
}

export function countProductsWithPrice(changes: PriceChangeSnapshot[]): number {
  return changes.filter(
    (c) =>
      (c.priceDiff && c.priceDiff.length > 0) ||
      Object.keys(c.newPrices ?? c.prices ?? {}).length > 0,
  ).length;
}

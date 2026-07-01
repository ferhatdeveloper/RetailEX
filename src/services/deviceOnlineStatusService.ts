/**
 * Cihaz çevrimiçi durumu: birincil WebSocket (store_devices), yedek son aktivite.
 */

import { getPostgrestBaseUrl } from '../config/postgrest.config';
import { APP_SEMVER } from '../core/version';
import { fetchRetailexAware } from '../utils/retailexDevProxy';

export type StoreDevicePresenceRow = {
  deviceId: string;
  storeId: string;
  deviceName: string;
  status: string;
  lastSeen: string | null;
  appVersion: string | null;
};

export type DeviceOnlineSource = 'websocket' | 'fallback' | 'none';

export type DeviceOnlineState = 'online' | 'stale' | 'offline';

export type ResolvedDeviceOnline = {
  state: DeviceOnlineState;
  source: DeviceOnlineSource;
  label: string;
  lastSeenAt: string | null;
  wsStatus: string | null;
};

/** WS heartbeat bu süreden eskiyse "canlı" sayılmaz (ms) */
export const WS_PRESENCE_STALE_MS = 3 * 60 * 1000;

/** Yedek: son aktivite penceresi (ms) — enterpriseSync ile uyumlu */
export const FALLBACK_ONLINE_MS = 24 * 60 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function restBase(): string {
  return getPostgrestBaseUrl().replace(/\/+$/, '');
}

export function isValidStoreUuid(storeId: string | null | undefined): storeId is string {
  return !!storeId && UUID_RE.test(storeId.trim());
}

function mapPresenceRow(row: Record<string, unknown>): StoreDevicePresenceRow {
  return {
    deviceId: String(row.device_id ?? ''),
    storeId: String(row.store_id ?? ''),
    deviceName: String(row.device_name ?? ''),
    status: String(row.status ?? 'offline'),
    lastSeen: row.last_seen ? String(row.last_seen) : null,
    appVersion: row.app_version ? String(row.app_version) : null,
  };
}

/** Merkez PostgREST: tüm store_devices kayıtları */
export async function fetchStoreDevicesPresence(): Promise<StoreDevicePresenceRow[]> {
  const base = restBase();
  if (!base) return [];
  try {
    const url =
      `${base}/store_devices?select=device_id,store_id,device_name,status,last_seen,app_version` +
      '&order=last_seen.desc.nullslast&limit=500';
    const res = await fetchRetailexAware(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Accept-Profile': 'public' },
    });
    if (!res.ok) return [];
    return ((await res.json()) as Array<Record<string, unknown>>).map(mapPresenceRow);
  } catch {
    return [];
  }
}

/** WS bağlandığında / heartbeat — merkez store_devices */
export async function pushDevicePresenceOnline(opts: {
  deviceId: string;
  storeId: string;
  deviceName?: string;
  appVersion?: string;
}): Promise<boolean> {
  if (!isValidStoreUuid(opts.storeId) || !opts.deviceId?.trim()) return false;
  const base = restBase();
  if (!base) return false;
  const now = new Date().toISOString();
  const body = {
    store_id: opts.storeId,
    device_id: opts.deviceId.trim(),
    device_name: (opts.deviceName || opts.deviceId).slice(0, 255),
    status: 'online',
    last_seen: now,
    app_version: opts.appVersion ?? APP_SEMVER,
    updated_at: now,
  };
  try {
    const res = await fetchRetailexAware(`${base}/store_devices`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
        Prefer: 'resolution=merge-duplicates,on_conflict=device_id',
      },
      body: JSON.stringify(body),
    });
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}

/** WS kapandığında */
export async function pushDevicePresenceOffline(deviceId: string): Promise<boolean> {
  if (!deviceId?.trim()) return false;
  const base = restBase();
  if (!base) return false;
  const now = new Date().toISOString();
  try {
    const res = await fetchRetailexAware(
      `${base}/store_devices?device_id=eq.${encodeURIComponent(deviceId.trim())}`,
      {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Profile': 'public',
          'Content-Profile': 'public',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status: 'offline', last_seen: now, updated_at: now }),
      },
    );
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export function resolveDeviceOnlineStatus(opts: {
  wsPresence?: StoreDevicePresenceRow | null;
  fallbackLastSeenMs?: number | null;
  now?: number;
}): ResolvedDeviceOnline {
  const now = opts.now ?? Date.now();
  const ws = opts.wsPresence;

  if (ws?.status === 'online' && ws.lastSeen) {
    const wsMs = Date.parse(ws.lastSeen);
    if (Number.isFinite(wsMs) && now - wsMs <= WS_PRESENCE_STALE_MS) {
      return {
        state: 'online',
        source: 'websocket',
        label: 'Canlı (WS)',
        lastSeenAt: ws.lastSeen,
        wsStatus: ws.status,
      };
    }
    if (Number.isFinite(wsMs) && now - wsMs <= WS_PRESENCE_STALE_MS * 3) {
      return {
        state: 'stale',
        source: 'websocket',
        label: 'WS zayıf',
        lastSeenAt: ws.lastSeen,
        wsStatus: ws.status,
      };
    }
  }

  const fb = opts.fallbackLastSeenMs ?? 0;
  if (fb > 0 && now - fb < FALLBACK_ONLINE_MS) {
    return {
      state: 'online',
      source: 'fallback',
      label: 'Yedek (24s)',
      lastSeenAt: new Date(fb).toISOString(),
      wsStatus: ws?.status ?? null,
    };
  }

  if (ws?.lastSeen) {
    return {
      state: 'offline',
      source: ws ? 'websocket' : 'none',
      label: 'Kapalı',
      lastSeenAt: ws.lastSeen,
      wsStatus: ws.status,
    };
  }

  return {
    state: 'offline',
    source: 'none',
    label: 'Kapalı',
    lastSeenAt: fb > 0 ? new Date(fb).toISOString() : null,
    wsStatus: null,
  };
}

export function onlineStateBadgeClass(state: DeviceOnlineState, source: DeviceOnlineSource): string {
  if (state === 'online' && source === 'websocket') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  }
  if (state === 'online' && source === 'fallback') {
    return 'bg-amber-100 text-amber-900 border-amber-300';
  }
  if (state === 'stale') {
    return 'bg-orange-100 text-orange-900 border-orange-300';
  }
  return 'bg-gray-100 text-gray-600 border-gray-300';
}

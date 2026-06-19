/**
 * Yerel / uzak RetailEX Terazi Köprüsü HTTP istemcisi.
 * Windows servisi: scripts/scale-bridge/server.mjs (port 3012)
 *
 * URL/token önceliği:
 * 1) localStorage (kullanıcı manuel override)
 * 2) Seçili mağaza (stores.scale_bridge_url)
 * 3) retailex_web_config (tenant_registry'den girişte)
 */

import type { ScaleDevice } from '../utils/scaleProtocol';
import type { Product } from '../App';
import { productsToRongtaPluRecords } from '../utils/rongtaRlsProtocol';
import { parseStoredRetailexWebConfig } from '../utils/retailexWebConfigMerge';

const STORAGE_URL = 'retailex_scale_bridge_url';
const STORAGE_TOKEN = 'retailex_scale_bridge_token';
const STORAGE_MANUAL = 'retailex_scale_bridge_manual';
const STORAGE_STORE_ID = 'retailex_scale_bridge_store_id';

export type ScaleBridgeSource = 'manual' | 'store' | 'tenant' | 'none';

export type StoreScaleBridgeRow = {
  id: string;
  name: string;
  code?: string;
  scale_bridge_url?: string | null;
  scale_bridge_token?: string | null;
};

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function isScaleBridgeManualOverride(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_MANUAL) === '1';
}

export function getScaleBridgeStoreId(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem(STORAGE_STORE_ID) || '').trim();
}

export function setScaleBridgeStoreId(storeId: string): void {
  const v = storeId.trim();
  if (v) localStorage.setItem(STORAGE_STORE_ID, v);
  else localStorage.removeItem(STORAGE_STORE_ID);
}

export function getScaleBridgeUrl(): string {
  if (typeof window === 'undefined') return '';
  return normalizeUrl(localStorage.getItem(STORAGE_URL) || '');
}

export function setScaleBridgeUrl(url: string, options?: { manual?: boolean }): void {
  const v = normalizeUrl(url);
  if (v) localStorage.setItem(STORAGE_URL, v);
  else localStorage.removeItem(STORAGE_URL);
  if (options?.manual) {
    localStorage.setItem(STORAGE_MANUAL, '1');
  }
}

export function getScaleBridgeToken(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem(STORAGE_TOKEN) || '').trim();
}

export function setScaleBridgeToken(token: string, options?: { manual?: boolean }): void {
  const v = token.trim();
  if (v) localStorage.setItem(STORAGE_TOKEN, v);
  else localStorage.removeItem(STORAGE_TOKEN);
  if (options?.manual) {
    localStorage.setItem(STORAGE_MANUAL, '1');
  }
}

/** Manuel override bayrağını kaldırır; tenant/mağaza senkronu tekrar uygulanabilir. */
export function clearScaleBridgeManualOverride(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_MANUAL);
}

export function applyScaleBridgeSettings(
  url: string | null | undefined,
  token: string | null | undefined,
  options?: { manual?: boolean; storeId?: string }
): void {
  const u = normalizeUrl(String(url || ''));
  const t = String(token || '').trim();
  if (options?.storeId) setScaleBridgeStoreId(options.storeId);
  if (u) setScaleBridgeUrl(u, { manual: options?.manual });
  else if (!options?.manual) setScaleBridgeUrl('');
  if (t) setScaleBridgeToken(t, { manual: options?.manual });
  else if (!options?.manual) setScaleBridgeToken('');
}

/** Kiracı girişinde tenant_registry → web_config alanlarını localStorage'a yansıt. */
export function syncScaleBridgeFromWebConfig(force = false): void {
  if (typeof window === 'undefined') return;
  if (!force && isScaleBridgeManualOverride()) return;
  const cfg = parseStoredRetailexWebConfig();
  const url = normalizeUrl(String(cfg.scale_bridge_url || ''));
  const token = String(cfg.scale_bridge_token || '').trim();
  if (url || token) {
    applyScaleBridgeSettings(url, token);
  }
}

/** Mağaza satırından köprü ayarlarını uygula (stores.scale_bridge_*). */
export function applyScaleBridgeFromStore(
  store: StoreScaleBridgeRow,
  options?: { manual?: boolean }
): boolean {
  const url = normalizeUrl(String(store.scale_bridge_url || ''));
  const token = String(store.scale_bridge_token || '').trim();
  if (!url && !token) return false;
  applyScaleBridgeSettings(url, token, { manual: options?.manual, storeId: store.id });
  return true;
}

export function resolveScaleBridgeSource(): ScaleBridgeSource {
  if (typeof window === 'undefined') return 'none';
  if (isScaleBridgeManualOverride()) return 'manual';
  if (getScaleBridgeStoreId()) return 'store';
  const cfg = parseStoredRetailexWebConfig();
  if (normalizeUrl(String(cfg.scale_bridge_url || ''))) return 'tenant';
  if (getScaleBridgeUrl()) return 'manual';
  return 'none';
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getScaleBridgeToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function bridgeFetch<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const base = getScaleBridgeUrl();
  if (!base) throw new Error('Terazi köprü URL tanımlı değil');
  const res = await fetchWithTimeout(`${base}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string>) },
  }, timeoutMs);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `HTTP ${res.status}`);
  }
  return json;
}

const BRIDGE_FETCH_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = BRIDGE_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const extSignal = init?.signal;
  const onExternalAbort = () => controller.abort();
  if (extSignal) {
    if (extSignal.aborted) controller.abort();
    else extSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timer);
    if (extSignal) extSignal.removeEventListener('abort', onExternalAbort);
  }
}

export type ScaleBridgeHealth = {
  reachable: boolean;
  authenticated: boolean;
  message?: string;
};

/** Köprü erişilebilirliği (/status) ve yetkili API (/scales) ayrı değerlendirilir. */
export async function scaleBridgeHealthCheck(): Promise<ScaleBridgeHealth> {
  const base = getScaleBridgeUrl();
  if (!base) {
    return { reachable: false, authenticated: false, message: 'Köprü URL tanımlı değil' };
  }
  try {
    const res = await fetchWithTimeout(`${base}/status`, { headers: headers() }, 8_000);
    if (!res.ok) {
      return { reachable: false, authenticated: false, message: `Köprü yanıt vermiyor (HTTP ${res.status})` };
    }
    const json = (await res.json()) as { ok?: boolean };
    if (!json.ok) {
      return { reachable: false, authenticated: false, message: 'Köprü servisi hazır değil' };
    }
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError'
      ? 'Köprü zaman aşımı — servis çalışıyor mu? (port 3012)'
      : 'Köprüye ulaşılamıyor — URL veya firewall kontrol edin';
    return { reachable: false, authenticated: false, message: msg };
  }

  try {
    await scaleBridgeListDevices();
    return { reachable: true, authenticated: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (/401|403|unauthorized/i.test(errMsg)) {
      const url = getScaleBridgeUrl();
      const onLoopback = /127\.0\.0\.1|localhost/i.test(url);
      return {
        reachable: true,
        authenticated: false,
        message: onLoopback
          ? 'Token uyuşmuyor — Köprü Ayarları → Token alanı, scale-bridge.json içindeki authToken ile aynı olmalı'
          : 'Uzak erişim için token gerekli — mağaza PC\'de authToken\'ı Köprü Ayarlarına girin veya URL\'yi http://127.0.0.1:3012 yapın',
      };
    }
    return { reachable: true, authenticated: false, message: errMsg || 'Köprü API hatası' };
  }
}

export async function scaleBridgePing(): Promise<boolean> {
  const h = await scaleBridgeHealthCheck();
  return h.reachable;
}

export async function scaleBridgeListDevices(): Promise<ScaleDevice[]> {
  const json = await bridgeFetch<{ scales: ScaleDevice[] }>('/scales');
  return json.scales || [];
}

export async function scaleBridgeSaveDevice(device: ScaleDevice): Promise<ScaleDevice> {
  const json = await bridgeFetch<{ scale: ScaleDevice }>('/scales', {
    method: 'POST',
    body: JSON.stringify({
      id: device.id,
      name: device.name,
      brand: device.brand,
      model: device.model,
      ipAddress: device.ipAddress,
      port: device.port,
      enabled: device.status !== 'offline',
    }),
  });
  return json.scale;
}

export async function scaleBridgeDeleteDevice(id: string): Promise<void> {
  await bridgeFetch(`/scales/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export type ScaleBridgeTestResult = {
  ok: boolean;
  message?: string;
  displayText?: string;
  port?: number;
};

export async function scaleBridgeTestDevice(device: ScaleDevice): Promise<boolean> {
  const result = await scaleBridgeTestDeviceDetailed(device);
  return result.ok;
}

export async function scaleBridgeTestDeviceDetailed(device: ScaleDevice): Promise<ScaleBridgeTestResult> {
  const json = await bridgeFetch<ScaleBridgeTestResult>(
    `/scales/${encodeURIComponent(device.id)}/test`,
    { method: 'POST', body: '{}' }
  );
  return {
    ok: !!json.ok,
    message: json.message,
    displayText: json.displayText,
    port: json.port,
  };
}

export type ScaleBridgeScanDefaults = {
  startIP: string;
  endIP: string;
  subnets?: { startIP: string; endIP: string; sourceIp?: string | null }[];
};

export type ScaleBridgeScanResult = {
  startIP: string;
  endIP: string;
  scanned: number;
  tcpCandidates?: number;
  protocolVerified?: number;
  tcpOnly?: number;
  devices: {
    ipAddress: string;
    port: number;
    brand?: string;
    model?: string;
    isResponding: boolean;
    protocolVerified?: boolean;
    discoveryMethod?: 'protocol' | 'tcp' | 'inbound';
    openPorts?: number[];
  }[];
};

/** Tauri masaüstünde köprü URL yoksa yerel servisi kullan. */
export function resolveScaleBridgeBaseUrl(): string {
  const configured = getScaleBridgeUrl();
  if (configured) return configured;
  if (typeof window !== 'undefined' && !!(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    return 'http://127.0.0.1:3012';
  }
  return '';
}

export async function scaleBridgeScanDefaults(): Promise<ScaleBridgeScanDefaults> {
  const base = resolveScaleBridgeBaseUrl();
  if (!base) {
    return { startIP: '192.168.1.1', endIP: '192.168.1.254' };
  }
  const res = await fetch(`${base}/scan/defaults`, { headers: headers() });
  const json = (await res.json().catch(() => ({}))) as ScaleBridgeScanDefaults & { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

export async function scaleBridgeListInboundDevices(): Promise<ScaleBridgeScanResult['devices']> {
  try {
    const json = await bridgeFetch<{ devices: ScaleBridgeScanResult['devices'] }>('/scales/inbound');
    return json.devices || [];
  } catch {
    return [];
  }
}

export async function scaleBridgeScanNetwork(
  startIP?: string,
  endIP?: string,
  concurrency = 32,
  options?: { allSubnets?: boolean; signal?: AbortSignal }
): Promise<ScaleBridgeScanResult> {
  const base = resolveScaleBridgeBaseUrl();
  if (!base) {
    throw new Error('Terazi köprüsüne erişilemiyor. Mağaza PC\'de köprü servisinin çalıştığından emin olun.');
  }
  const body: Record<string, string | number | boolean> = { concurrency };
  if (startIP) body.startIP = startIP;
  if (endIP) body.endIP = endIP;
  if (options?.allSubnets !== undefined) body.allSubnets = options.allSubnets;
  body.ports = 'all';
  const res = await fetchWithTimeout(`${base}/scan`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: options?.signal,
  }, 600_000);
  const json = (await res.json().catch(() => ({}))) as ScaleBridgeScanResult & { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

export async function scaleBridgeSendProducts(
  device: ScaleDevice,
  products: Product[],
  pluStartIndex = 1
): Promise<{
  success: boolean;
  message: string;
  sentCount?: number;
  failedCount?: number;
  errors?: string[];
}> {
  const records = productsToRongtaPluRecords(
    products.map((p, index) => ({
      pluCode: String(pluStartIndex + index).padStart(5, '0'),
      name: p.name.substring(0, 40),
      price: p.price,
      unit: p.unit,
      barcode: p.barcode,
    })),
    pluStartIndex
  );

  return bridgeFetch('/send-plu', {
    method: 'POST',
    body: JSON.stringify({
      scaleId: device.id,
      records,
      pluStartIndex,
    }),
  });
}

export async function scaleBridgeFetchSales(
  device: ScaleDevice,
  options?: { maxRecords?: number; timeoutMs?: number }
): Promise<{
  success: boolean;
  message: string;
  count?: number;
  records?: import('../utils/rongtaRlsProtocol').RongtaSalesRecord[];
}> {
  return bridgeFetch(`/scales/${encodeURIComponent(device.id)}/sales`, {
    method: 'POST',
    body: JSON.stringify({
      maxRecords: options?.maxRecords ?? 500,
      timeoutMs: options?.timeoutMs ?? 15000,
    }),
  });
}

export function isScaleBridgeMode(): boolean {
  return !!getScaleBridgeUrl();
}

/** Aktif mağazaları köprü alanlarıyla yükle (mağaza seçimi için). */
export async function loadStoresWithScaleBridge(firmNr: string): Promise<StoreScaleBridgeRow[]> {
  const nr = firmNr.trim();
  if (!nr) return [];

  try {
    const { DB_SETTINGS } = await import('./postgres');
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./api/postgrestClient');
      const rows = await postgrest.get(
        '/stores',
        {
          select: 'id,name,code,scale_bridge_url,scale_bridge_token',
          firm_nr: `eq.${nr}`,
          is_active: 'eq.true',
          order: 'name.asc',
        },
        { schema: 'public' }
      );
      return (Array.isArray(rows) ? rows : []) as StoreScaleBridgeRow[];
    }

    const { postgres } = await import('./postgres');
    const { rows } = await postgres.query(
      `SELECT id, name, code, scale_bridge_url, scale_bridge_token
       FROM stores WHERE firm_nr = $1 AND is_active = true ORDER BY name ASC`,
      [nr]
    );
    return rows as StoreScaleBridgeRow[];
  } catch {
    return [];
  }
}

/** Mağaza listesinden köprü URL'si olanları seç; tenant varsayılanına göre uygula. */
export async function autoApplyScaleBridgeForFirm(firmNr: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (isScaleBridgeManualOverride()) return;

  const stores = await loadStoresWithScaleBridge(firmNr);
  const withBridge = stores.filter((s) => normalizeUrl(String(s.scale_bridge_url || '')));
  if (withBridge.length === 0) {
    syncScaleBridgeFromWebConfig();
    return;
  }

  const savedStoreId = getScaleBridgeStoreId();
  const preferred =
    withBridge.find((s) => s.id === savedStoreId) ||
    withBridge.find((s) => s.code === '001' || s.code === '01') ||
    withBridge[0];

  if (preferred) {
    applyScaleBridgeFromStore(preferred);
    return;
  }

  syncScaleBridgeFromWebConfig();
}


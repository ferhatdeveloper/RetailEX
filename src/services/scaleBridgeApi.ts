/**
 * Yerel / uzak RetailEX Terazi Köprüsü HTTP istemcisi.
 * Windows servisi: scripts/scale-bridge/server.mjs (port 3012)
 */

import type { ScaleDevice } from '../utils/scaleProtocol';
import type { Product } from '../App';
import { productsToRongtaPluRecords } from '../utils/rongtaRlsProtocol';

const STORAGE_URL = 'retailex_scale_bridge_url';
const STORAGE_TOKEN = 'retailex_scale_bridge_token';

export function getScaleBridgeUrl(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem(STORAGE_URL) || '').trim().replace(/\/+$/, '');
}

export function setScaleBridgeUrl(url: string): void {
  const v = url.trim().replace(/\/+$/, '');
  if (v) localStorage.setItem(STORAGE_URL, v);
  else localStorage.removeItem(STORAGE_URL);
}

export function getScaleBridgeToken(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem(STORAGE_TOKEN) || '').trim();
}

export function setScaleBridgeToken(token: string): void {
  const v = token.trim();
  if (v) localStorage.setItem(STORAGE_TOKEN, v);
  else localStorage.removeItem(STORAGE_TOKEN);
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getScaleBridgeToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function bridgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getScaleBridgeUrl();
  if (!base) throw new Error('Terazi köprü URL tanımlı değil');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string>) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `HTTP ${res.status}`);
  }
  return json;
}

export async function scaleBridgePing(): Promise<boolean> {
  try {
    const base = getScaleBridgeUrl();
    if (!base) return false;
    const res = await fetch(`${base}/status`, { headers: headers() });
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean };
    return !!json.ok;
  } catch {
    return false;
  }
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

export async function scaleBridgeTestDevice(device: ScaleDevice): Promise<boolean> {
  const json = await bridgeFetch<{ ok?: boolean }>(
    `/scales/${encodeURIComponent(device.id)}/test`,
    { method: 'POST', body: '{}' }
  );
  return !!json.ok;
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

export function isScaleBridgeMode(): boolean {
  return !!getScaleBridgeUrl();
}

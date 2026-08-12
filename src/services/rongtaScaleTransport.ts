/**
 * Rongta terazi taşıma katmanı — Tauri (doğrudan TCP) veya pg_bridge (LAN).
 */

import { IS_TAURI } from '../utils/env';
import { getBridgeUrl } from '../utils/env';
import type { RongtaPluRecord } from '../utils/rongtaRlsProtocol';

export interface RongtaDeviceTarget {
  ipAddress: string;
  port?: number;
}

export interface RongtaSyncResponse {
  success: boolean;
  message: string;
  sentCount?: number;
  failedCount?: number;
  errors?: string[];
}

export async function rongtaTestConnection(target: RongtaDeviceTarget): Promise<boolean> {
  const result = await rongtaTestConnectionDetailed(target);
  return result.ok;
}

export async function rongtaTestConnectionDetailed(
  target: RongtaDeviceTarget
): Promise<{ ok: boolean; message?: string; displayText?: string }> {
  const body = {
    ipAddress: target.ipAddress,
    port: target.port,
  };

  if (IS_TAURI) {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ ok?: boolean; message?: string; displayText?: string }>('rongta_scale_test', body);
    return {
      ok: !!result?.ok,
      message: result?.message,
      displayText: result?.displayText,
    };
  }

  const res = await fetch(`${getBridgeUrl()}/api/scale/rongta/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, message: `HTTP ${res.status}` };
  }
  const json = (await res.json()) as { ok?: boolean; message?: string; displayText?: string };
  return {
    ok: !!json.ok,
    message: json.message,
    displayText: json.displayText,
  };
}

export interface RongtaSalesFetchResult {
  success: boolean;
  message: string;
  count?: number;
  records?: import('../utils/rongtaRlsProtocol').RongtaSalesRecord[];
  port?: number;
}

export async function rongtaFetchSalesRecords(
  target: RongtaDeviceTarget,
  options?: { maxRecords?: number; timeoutMs?: number }
): Promise<RongtaSalesFetchResult> {
  const body = {
    ipAddress: target.ipAddress,
    port: target.port,
    maxRecords: options?.maxRecords,
    timeoutMs: options?.timeoutMs,
  };

  if (IS_TAURI) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<RongtaSalesFetchResult>('rongta_scale_fetch_sales', body);
  }

  const res = await fetch(`${getBridgeUrl()}/api/scale/rongta/fetch-sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as RongtaSalesFetchResult & { error?: string };
  if (!res.ok) {
    return {
      success: false,
      message: json.message || json.error || `HTTP ${res.status}`,
      count: 0,
      records: [],
    };
  }
  return json;
}

export async function rongtaSendPluRecords(
  target: RongtaDeviceTarget,
  records: RongtaPluRecord[]
): Promise<RongtaSyncResponse> {
  const body = {
    ipAddress: target.ipAddress,
    port: target.port,
    records,
  };

  if (IS_TAURI) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<RongtaSyncResponse>('rongta_scale_send_plu', body);
  }

  const res = await fetch(`${getBridgeUrl()}/api/scale/rongta/send-plu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as RongtaSyncResponse & { error?: string };
  if (!res.ok) {
    return {
      success: false,
      message: json.message || json.error || `HTTP ${res.status}`,
      sentCount: 0,
      failedCount: records.length,
    };
  }
  return json;
}

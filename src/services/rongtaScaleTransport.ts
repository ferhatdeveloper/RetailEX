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
  const body = {
    ipAddress: target.ipAddress,
    port: target.port,
  };

  if (IS_TAURI) {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ ok: boolean }>('rongta_scale_test', body);
    return !!result?.ok;
  }

  const res = await fetch(`${getBridgeUrl()}/api/scale/rongta/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { ok?: boolean };
  return !!json.ok;
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

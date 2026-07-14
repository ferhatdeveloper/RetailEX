/**
 * ESC/POS TCP — pg_bridge `/api/printer/escpos-tcp`.
 * Terazi köprüsü ile aynı desen: telefon → PC bridge → LAN yazıcı.
 */

import { getBridgeBaseUrl, useConfigStore } from '../store/configStore';
import { uint8ToBase64 } from './escpos/escposBytes';

export type EscposBridgeResult = {
  ok: boolean;
  message: string;
  bytesSent?: number;
};

async function postBridge<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const bridgeUrl = getBridgeBaseUrl(useConfigStore.getState().config);
  let response: Response;
  try {
    response = await fetch(`${bridgeUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Yazıcı köprüsüne ulaşılamadı (${bridgeUrl}${path}). PC'de npm run bridge ve aynı Wi‑Fi gerekir. ${msg}`,
    );
  }
  const json = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
    ok?: boolean;
  };
  if (!response.ok) {
    throw new Error(json.message || json.error || `HTTP ${response.status}`);
  }
  return json;
}

export async function bridgeEscposTcpSend(
  host: string,
  port: number | undefined,
  payload: Uint8Array,
): Promise<EscposBridgeResult> {
  const dataB64 = uint8ToBase64(payload);
  const json = await postBridge<EscposBridgeResult>('/api/printer/escpos-tcp', {
    host,
    port,
    dataB64,
  });
  return {
    ok: !!json.ok,
    message: json.message || (json.ok ? 'Yazdırıldı' : 'Yazdırılamadı'),
    bytesSent: json.bytesSent,
  };
}

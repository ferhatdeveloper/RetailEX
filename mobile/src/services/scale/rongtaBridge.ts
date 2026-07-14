/**
 * Rongta TCP — pg_bridge `/api/scale/rongta/*` (web `rongtaScaleTransport` ile aynı).
 * Telefonda ham TCP soketi yok; köprü LAN üzerinden teraziye ulaşır.
 */

import { getBridgeBaseUrl, useConfigStore } from '../../store/configStore';
import type { ScaleSyncResult } from '../../types/scale';

export type RongtaPluPayload = {
  pluCode: string;
  name: string;
  price: number;
  unit?: string;
  barcode?: string;
  lfCode?: string;
  barcodeType?: number;
  department?: number;
  shelfDays?: number;
  operate?: 'I' | 'D';
  rank?: number;
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
      `Terazi köprüsüne ulaşılamadı (${bridgeUrl}${path}). PC'de npm run bridge ve aynı Wi‑Fi gerekir. ${msg}`,
    );
  }
  const json = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
    ok?: boolean;
    success?: boolean;
  };
  if (!response.ok) {
    throw new Error(json.message || json.error || `HTTP ${response.status}`);
  }
  return json;
}

export async function bridgeRongtaTest(
  ipAddress: string,
  port?: number,
): Promise<{ ok: boolean; message?: string; displayText?: string }> {
  return postBridge('/api/scale/rongta/test', { ipAddress, port });
}

export async function bridgeRongtaSendPlu(
  ipAddress: string,
  port: number | undefined,
  records: RongtaPluPayload[],
): Promise<ScaleSyncResult> {
  const json = await postBridge<{
    success?: boolean;
    message?: string;
    sentCount?: number;
    failedCount?: number;
    errors?: string[];
  }>('/api/scale/rongta/send-plu', { ipAddress, port, records });

  const sent = Number(json.sentCount ?? 0);
  const failed = Number(json.failedCount ?? 0);
  return {
    success: !!json.success,
    message: json.message || (json.success ? 'PLU gönderildi' : 'PLU gönderilemedi'),
    productCount: records.length,
    sentCount: sent,
    failedCount: failed,
    errors: json.errors ?? [],
  };
}

export async function bridgeRongtaFetchSales(
  ipAddress: string,
  port?: number,
): Promise<{
  success: boolean;
  message: string;
  count: number;
  records: Array<{
    pluName?: string;
    lfCode?: number;
    weight?: number;
    totalPrice?: number;
    unitPrice?: number;
    quantity?: number;
    saleDate?: string;
  }>;
}> {
  const json = await postBridge<{
    success?: boolean;
    message?: string;
    count?: number;
    records?: Array<Record<string, unknown>>;
  }>('/api/scale/rongta/fetch-sales', { ipAddress, port });

  return {
    success: !!json.success,
    message: json.message || '',
    count: Number(json.count ?? json.records?.length ?? 0),
    records: (json.records ?? []) as Array<{
      pluName?: string;
      lfCode?: number;
      weight?: number;
      totalPrice?: number;
      unitPrice?: number;
      quantity?: number;
      saleDate?: string;
    }>,
  };
}

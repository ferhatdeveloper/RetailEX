/**
 * Rongta TCP — önce doğrudan (dev client + tcp-socket), yoksa pg_bridge.
 */

import { getBridgeBaseUrl, useConfigStore } from '../../store/configStore';
import type { ScaleSyncResult } from '../../types/scale';
import { buildHotkeyTables, hotkeyTransportHint } from './hotkeyHelper';
import { labelTemplateTransportHint } from './labelSlotHelper';
import {
  isNativeScaleTcpAvailable,
  nativeRongtaClearPlu,
  nativeRongtaFetchSales,
  nativeRongtaSendPlu,
  nativeRongtaTest,
} from './rongtaTcpNative';
import type { RongtaPluRecord } from './rongtaProtocol';

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
  labelId?: number;
};

export type RongtaVia = 'direct' | 'bridge';

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

function toNativeRecords(records: RongtaPluPayload[]): RongtaPluRecord[] {
  return records.map((r, i) => ({
    pluCode: r.pluCode,
    name: r.name,
    price: r.price,
    unit: r.unit,
    barcode: r.barcode,
    lfCode: r.lfCode,
    barcodeType: r.barcodeType,
    department: r.department,
    shelfDays: r.shelfDays,
    operate: r.operate ?? 'I',
    rank: r.rank ?? i + 1,
    labelId: r.labelId,
  }));
}

export async function bridgeRongtaTest(
  ipAddress: string,
  port?: number,
): Promise<{ ok: boolean; message?: string; displayText?: string; via?: RongtaVia }> {
  if (isNativeScaleTcpAvailable()) {
    try {
      const r = await nativeRongtaTest(ipAddress, port);
      if (r.ok) return r;
      // Doğrudan başarısızsa bridge yedek
    } catch {
      /* bridge fallback */
    }
  }
  const r = await postBridge<{
    ok?: boolean;
    message?: string;
    displayText?: string;
  }>('/api/scale/rongta/test', { ipAddress, port });
  return { ...r, ok: !!r.ok, via: 'bridge' };
}

export async function bridgeRongtaSendPlu(
  ipAddress: string,
  port: number | undefined,
  records: RongtaPluPayload[],
): Promise<ScaleSyncResult & { via?: RongtaVia }> {
  if (isNativeScaleTcpAvailable()) {
    try {
      const r = await nativeRongtaSendPlu(ipAddress, port, toNativeRecords(records));
      if (r.success || r.sentCount > 0) return r;
    } catch {
      /* bridge */
    }
  }
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
    via: 'bridge',
  };
}

export async function bridgeRongtaFetchSales(
  ipAddress: string,
  port?: number,
): Promise<{
  success: boolean;
  message: string;
  count: number;
  via?: RongtaVia;
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
  if (isNativeScaleTcpAvailable()) {
    try {
      const r = await nativeRongtaFetchSales(ipAddress, port);
      return {
        success: r.success,
        message: r.message,
        count: r.count,
        via: 'direct',
        records: r.records.map((row) => ({
          pluName: row.freshCode,
          lfCode: Number(row.freshCode) || 0,
          weight: row.weight,
          totalPrice: row.totalAmount,
          unitPrice: row.unitPrice,
          quantity: 1,
          saleDate: row.saleDate,
        })),
      };
    } catch {
      /* bridge */
    }
  }

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
    via: 'bridge',
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

/** PLU temizle — operate=D (açık TCP) veya bridge aynı mantık. */
export async function bridgeRongtaClearPlu(
  ipAddress: string,
  port: number | undefined,
  records: RongtaPluPayload[],
): Promise<ScaleSyncResult & { via?: RongtaVia }> {
  if (!records.length) {
    return {
      success: false,
      message: 'Silinecek PLU listesi boş — önce ürün senkronu listesi gerekir.',
      productCount: 0,
      sentCount: 0,
      failedCount: 0,
      errors: ['records boş'],
    };
  }

  const deletes = records.map((r) => ({ ...r, operate: 'D' as const }));

  if (isNativeScaleTcpAvailable()) {
    try {
      const r = await nativeRongtaClearPlu(ipAddress, port, toNativeRecords(deletes));
      if (r.success || r.sentCount > 0) return r;
    } catch {
      /* bridge */
    }
  }

  const json = await postBridge<{
    success?: boolean;
    message?: string;
    sentCount?: number;
    failedCount?: number;
    errors?: string[];
  }>('/api/scale/rongta/clear-plu', { ipAddress, port, records: deletes });

  return {
    success: !!json.success,
    message: json.message || (json.success ? 'PLU temizlendi' : 'PLU temizlenemedi'),
    productCount: deletes.length,
    sentCount: Number(json.sentCount ?? 0),
    failedCount: Number(json.failedCount ?? deletes.length),
    errors: json.errors ?? [],
    via: 'bridge',
  };
}

/**
 * Hotkey gönderimi — tablo hazırlanır; açık TCP’de komut yok.
 * Bridge dürüst yanıt (DLL/SDK gerekli).
 */
export async function bridgeRongtaSendHotkeys(
  ipAddress: string,
  port: number | undefined,
  lfCodes: number[],
): Promise<{ success: boolean; message: string; tables: number[][] }> {
  const tables = buildHotkeyTables(lfCodes);
  try {
    const json = await postBridge<{ success?: boolean; message?: string }>(
      '/api/scale/rongta/send-hotkeys',
      { ipAddress, port, lfCodes, tables },
    );
    return {
      success: !!json.success,
      message: json.message || hotkeyTransportHint(),
      tables,
    };
  } catch {
    return {
      success: false,
      message: hotkeyTransportHint(),
      tables,
    };
  }
}

export async function bridgeRongtaSendLabelTemplate(
  ipAddress: string,
  _slot: string,
): Promise<{ success: boolean; message: string }> {
  void ipAddress;
  try {
    const json = await postBridge<{ success?: boolean; message?: string }>(
      '/api/scale/rongta/send-label-template',
      { ipAddress, slot: _slot },
    );
    return {
      success: !!json.success,
      message: json.message || labelTemplateTransportHint(),
    };
  } catch {
    return { success: false, message: labelTemplateTransportHint() };
  }
}

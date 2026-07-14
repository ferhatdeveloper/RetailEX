/**
 * Caller ID — pg_bridge consumer (web `restaurantCallerIdService` parity).
 * Producer: android-callerid-bridge APK veya EAS native CallStateReceiver.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBridgeBaseUrl, useConfigStore } from '../store/configStore';
import { fetchCustomers, type CustomerRow } from './customersApi';
import { syncCallerIdNativeConfig } from '../services/callerIdNative';

export type CallerIdMode = 'off' | 'virtual_pbx' | 'physical_device' | 'physical_serial';

export type CallerIdConfig = {
  mode: CallerIdMode;
  /** Boş → bridge `/api/caller_id/last` (virtual_pbx) */
  pollUrl: string;
  /** Saniye; web pollIntervalMs ile uyumlu (sn × 1000) */
  pollIntervalSec: number;
  /** CALLER_ID_PUSH_TOKEN — query / Bearer */
  apiToken: string;
  /** Cihaz ipucu (eski alan; native push device adı) */
  deviceHint: string;
};

export type CallerIdEvent = {
  phone: string;
  name?: string;
  receivedAt: string;
};

export type CallerIdCustomerContext = {
  phone: string;
  customerName?: string;
  address?: string;
  locationUrl?: string;
  note?: string;
  updatedAt?: string;
};

export const CALLER_ID_STORAGE_KEY = 'retailex_mobile_caller_id_config';

export const DEFAULT_CALLER_ID_CONFIG: CallerIdConfig = {
  mode: 'off',
  pollUrl: '',
  pollIntervalSec: 3,
  apiToken: '',
  deviceHint: '',
};

const PHONE_KEYS = [
  'phone',
  'telefon',
  'caller',
  'caller_number',
  'callerid',
  'callerId',
  'from',
  'numara',
  'PhoneNumber',
  'gsm',
  'mobile',
] as const;

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

function phoneMatchCandidates(raw: string): string[] {
  const d0 = onlyDigits(raw);
  if (!d0) return [];
  const set = new Set<string>();
  const push = (v: string) => {
    const x = onlyDigits(v);
    if (!x) return;
    set.add(x);
    if (x.length >= 10) set.add(x.slice(-10));
    if (x.length >= 7) set.add(x.slice(-7));
  };
  push(d0);
  if (d0.startsWith('00')) push(d0.slice(2));
  if (d0.startsWith('90') && d0.length > 10) push(d0.slice(2));
  if (d0.startsWith('964') && d0.length > 10) push(d0.slice(3));
  if (d0.startsWith('0') && d0.length > 10) push(d0.slice(1));
  return Array.from(set);
}

export function phoneDigitsForMatch(raw: string): string {
  const d = onlyDigits(raw);
  return d.length >= 10 ? d.slice(-10) : d;
}

export function extractPhoneFromObject(o: Record<string, unknown>): string | null {
  for (const k of PHONE_KEYS) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) {
      return v.replace(/\s+/g, '').trim();
    }
  }
  return null;
}

export function parseCallerIdPollPayload(data: unknown): CallerIdEvent | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const phone = extractPhoneFromObject(o);
  if (!phone) return null;
  const name =
    (typeof o.name === 'string' && o.name.trim()) ||
    (typeof o.caller_name === 'string' && o.caller_name.trim()) ||
    undefined;
  const receivedAt =
    (typeof o.receivedAt === 'string' && o.receivedAt) ||
    (typeof o.ts === 'string' && o.ts) ||
    new Date().toISOString();
  return { phone, name, receivedAt };
}

function withTokenQuery(url: string, apiToken: string): string {
  const t = apiToken.trim();
  if (!t) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(t)}`;
}

export function resolveCallerIdPollUrl(
  config: CallerIdConfig,
  bridgeBase?: string,
): string | null {
  if (config.mode === 'off' || config.mode === 'physical_serial') return null;
  const baseBridge =
    bridgeBase?.replace(/\/+$/, '') ||
    getBridgeBaseUrl(useConfigStore.getState().config);

  if (config.mode === 'virtual_pbx') {
    const base = config.pollUrl.trim()
      ? config.pollUrl.trim()
      : `${baseBridge}/api/caller_id/last`;
    return withTokenQuery(base, config.apiToken);
  }
  if (config.mode === 'physical_device') {
    const u = config.pollUrl.trim();
    if (!u) return null;
    return withTokenQuery(u, config.apiToken);
  }
  return null;
}

function lastNDigits(s: string, n: number): string {
  const d = onlyDigits(s);
  return d.length >= n ? d.slice(-n) : d;
}

export function findCustomerByCallerPhone(
  customers: CustomerRow[],
  callerPhone: string,
): CustomerRow | undefined {
  const targetCandidates = phoneMatchCandidates(callerPhone);
  const callerDigits = onlyDigits(callerPhone);
  const callerTail10 = callerDigits.length >= 10 ? callerDigits.slice(-10) : '';
  if (targetCandidates.length === 0 && !callerTail10) return undefined;

  return customers.find((c) => {
    const candidates = [c.phone].filter(Boolean) as string[];
    return candidates.some((p) => {
      const customerCandidates = phoneMatchCandidates(p);
      if (targetCandidates.length > 0) {
        if (customerCandidates.some((cc) => targetCandidates.includes(cc))) return true;
      }
      if (callerTail10.length === 10) {
        const pt = lastNDigits(p, 10);
        if (pt.length >= 10 && pt === callerTail10) return true;
      }
      return false;
    });
  });
}

/** PG / PostgREST üzerinden gevşek telefon adayı araması */
export async function findCustomerByPhoneLoose(rawPhone: string): Promise<CustomerRow | null> {
  const digits = onlyDigits(rawPhone);
  const tail10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const candidates = Array.from(
    new Set(
      [rawPhone, digits, tail10, `0${tail10}`, `90${tail10}`, `+90${tail10}`]
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
  for (const c of candidates) {
    try {
      const rows = await fetchCustomers(c, 40);
      const hit = findCustomerByCallerPhone(rows, rawPhone) || rows[0];
      if (hit) return hit;
    } catch {
      /* next */
    }
  }
  return null;
}

export async function loadCallerIdConfig(): Promise<CallerIdConfig> {
  try {
    const raw = await AsyncStorage.getItem(CALLER_ID_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CALLER_ID_CONFIG };
    const parsed = JSON.parse(raw) as Partial<CallerIdConfig>;
    return {
      mode: parsed.mode ?? DEFAULT_CALLER_ID_CONFIG.mode,
      pollUrl: parsed.pollUrl ?? '',
      pollIntervalSec: Math.max(1, Number(parsed.pollIntervalSec) || 3),
      apiToken: parsed.apiToken ?? '',
      deviceHint: parsed.deviceHint ?? '',
    };
  } catch {
    return { ...DEFAULT_CALLER_ID_CONFIG };
  }
}

export async function saveCallerIdConfig(cfg: CallerIdConfig): Promise<void> {
  const next: CallerIdConfig = {
    mode: cfg.mode,
    pollUrl: cfg.pollUrl.trim(),
    pollIntervalSec: Math.max(1, Number(cfg.pollIntervalSec) || 3),
    apiToken: cfg.apiToken.trim(),
    deviceHint: cfg.deviceHint.trim(),
  };
  await AsyncStorage.setItem(CALLER_ID_STORAGE_KEY, JSON.stringify(next));
  const bridge = getBridgeBaseUrl(useConfigStore.getState().config);
  const pushUrl = `${bridge}/api/caller_id/push`;
  await syncCallerIdNativeConfig({
    enabled: next.mode === 'virtual_pbx' || next.mode === 'physical_device',
    endpoint: next.pollUrl.trim() || pushUrl,
    token: next.apiToken,
    device: next.deviceHint,
  });
}

async function authHeaders(apiToken: string): Promise<Record<string, string>> {
  const t = apiToken.trim();
  if (!t) return { Accept: 'application/json' };
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${t}`,
  };
}

export async function fetchCallerIdLast(config: CallerIdConfig): Promise<CallerIdEvent | null> {
  const url = resolveCallerIdPollUrl(config);
  if (!url) return null;
  const res = await fetch(url, {
    method: 'GET',
    headers: await authHeaders(config.apiToken),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  return parseCallerIdPollPayload(data);
}

export async function pushCallerIdEvent(input: {
  phone: string;
  name?: string;
  token?: string;
  bridgeBase?: string;
}): Promise<{ ok: boolean; receivedAt?: string }> {
  const bridge =
    input.bridgeBase?.replace(/\/+$/, '') ||
    getBridgeBaseUrl(useConfigStore.getState().config);
  const url = `${bridge}/api/caller_id/push`;
  const token = (input.token || '').trim();
  const body: Record<string, string> = {
    phone: input.phone.trim(),
    name: (input.name || '').trim(),
  };
  if (token) body.token = token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || `HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; receivedAt?: string };
}

export async function postCallerIdCustomerContext(
  ctx: Omit<CallerIdCustomerContext, 'updatedAt'>,
  apiToken = '',
): Promise<void> {
  const bridge = getBridgeBaseUrl(useConfigStore.getState().config);
  const url = `${bridge}/api/caller_id/customer_context`;
  const token = apiToken.trim();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      phone: ctx.phone,
      customerName: ctx.customerName,
      address: ctx.address,
      locationUrl: ctx.locationUrl,
      note: ctx.note || 'RetailEX Mobile CallerID match',
      token: token || undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(`customer_context HTTP ${res.status}`);
  }
}

export async function fetchCallerIdCustomerLast(apiToken = ''): Promise<CallerIdCustomerContext | null> {
  const bridge = getBridgeBaseUrl(useConfigStore.getState().config);
  const url = withTokenQuery(`${bridge}/api/caller_id/customer_last`, apiToken);
  const res = await fetch(url, {
    method: 'GET',
    headers: await authHeaders(apiToken),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  if (!data || typeof data.phone !== 'string' || !data.phone) return null;
  return {
    phone: data.phone,
    customerName: typeof data.customerName === 'string' ? data.customerName : undefined,
    address: typeof data.address === 'string' ? data.address : undefined,
    locationUrl: typeof data.locationUrl === 'string' ? data.locationUrl : undefined,
    note: typeof data.note === 'string' ? data.note : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

/** Bridge canlı mı — LAN scan sonrası doğrulama */
export async function probeCallerIdBridge(baseUrl?: string): Promise<boolean> {
  const bridge = (baseUrl || getBridgeBaseUrl(useConfigStore.getState().config)).replace(/\/+$/, '');
  try {
    const res = await fetch(`${bridge}/api/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { service?: string };
    return String(data?.service || '').includes('PostgreSQL Bridge');
  } catch {
    return false;
  }
}

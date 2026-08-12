/**
 * Yerel Wi‑Fi LAN taraması — pg_bridge (/api/status) ve PostgREST (firms / root).
 * Expo Go uyumlu: yalnızca HTTP probe (UDP mDNS yok).
 * Web’de benzer otomatik bridge taraması yok; terazi tarayıcısından bağımsızdır.
 */

import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Network from 'expo-network';

export type LanServiceKind = 'bridge' | 'postgrest';

export type LanScanHit = {
  host: string;
  port: number;
  kind: LanServiceKind;
  /** http://host:port */
  baseUrl: string;
  label: string;
};

export type LanScanProgress = {
  done: number;
  total: number;
  found: number;
  currentHost?: string;
  /** Yeni bulunan sunucu (varsa) */
  hit?: LanScanHit;
};

export type LanScanOptions = {
  /** ms / host:port — varsayılan 600 */
  timeoutMs?: number;
  /** Paralel probe sayısı — varsayılan 28 */
  concurrency?: number;
  /** Mevcut köprü host’u (öncelikli probe) */
  hintHost?: string;
  signal?: AbortSignal;
  onProgress?: (p: LanScanProgress) => void;
};

const BRIDGE_PORTS = [3001, 3002] as const;
const POSTGREST_PORTS = [3000, 3002, 54321] as const;
const DEFAULT_TIMEOUT_MS = 600;
const DEFAULT_CONCURRENCY = 28;

/** Gevşek IPv4 doğrulama (leading zero kabul) */
export function isValidIpv4(ip: string): boolean {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 && n <= 255 && /^\d{1,3}$/.test(p);
  });
}

export function isPrivateIpv4(ip: string): boolean {
  if (!isValidIpv4(ip)) return false;
  const [a, b] = ip.split('.').map((x) => parseInt(x, 10));
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function subnetPrefix(ip: string): string {
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

/**
 * Cihazın Wi‑Fi / Ethernet IPv4 adresini bul (expo-network + NetInfo yedek).
 */
export async function getDeviceLanIp(): Promise<string | null> {
  try {
    const ip = await Network.getIpAddressAsync();
    if (ip && isValidIpv4(ip) && ip !== '0.0.0.0' && isPrivateIpv4(ip)) {
      return ip;
    }
  } catch {
    /* Expo Go / izin */
  }

  try {
    const state = await NetInfo.fetch();
    const details = state.details as { ipAddress?: string } | null;
    const ip = details?.ipAddress?.trim();
    if (ip && isValidIpv4(ip) && isPrivateIpv4(ip)) return ip;
  } catch {
    /* ignore */
  }

  return null;
}

function buildHostList(prefix: string, extras: string[]): string[] {
  const set = new Set<string>();
  for (const h of extras) {
    if (h && isValidIpv4(h)) set.add(h.trim());
  }
  // Gateway ve yaygın hostlar önce
  set.add(`${prefix}.1`);
  for (let i = 1; i <= 254; i++) {
    set.add(`${prefix}.${i}`);
  }
  return Array.from(set);
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response | null> {
  if (signal?.aborted) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function probeBridge(
  host: string,
  port: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<LanScanHit | null> {
  const baseUrl = `http://${host}:${port}`;
  const res = await fetchWithTimeout(`${baseUrl}/api/status`, timeoutMs, signal);
  if (!res) return null;
  try {
    const body = (await res.json()) as { status?: string; service?: string };
    const running =
      res.ok &&
      (body.status === 'RUNNING' ||
        /bridge|postgresql/i.test(String(body.service ?? '')));
    if (!running) return null;
    return {
      host,
      port,
      kind: 'bridge',
      baseUrl,
      label: `pg_bridge · ${host}:${port}`,
    };
  } catch {
    return null;
  }
}

async function probePostgrest(
  host: string,
  port: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<LanScanHit | null> {
  const baseUrl = `http://${host}:${port}`;
  const firms = await fetchWithTimeout(
    `${baseUrl}/firms?select=firm_nr&limit=1`,
    timeoutMs,
    signal,
  );
  if (firms) {
    const ct = firms.headers.get('content-type') || '';
    if (
      ct.includes('json') &&
      [200, 201, 206, 401, 403, 406].includes(firms.status)
    ) {
      // Body’yi tüket (bağlantı sızıntısı önle)
      await firms.text().catch(() => undefined);
      return {
        host,
        port,
        kind: 'postgrest',
        baseUrl,
        label: `PostgREST · ${host}:${port}`,
      };
    }
    await firms.text().catch(() => undefined);
  }

  const root = await fetchWithTimeout(`${baseUrl}/`, timeoutMs, signal);
  if (!root) return null;
  try {
    const ct = root.headers.get('content-type') || '';
    if (!ct.includes('json') || !root.ok) {
      await root.text().catch(() => undefined);
      return null;
    }
    const text = await root.text();
    // OpenAPI / PostgREST kök yanıtı genelde paths veya swagger benzeri JSON
    if (
      /"paths"\s*:/.test(text) ||
      /postgrest/i.test(text) ||
      /"openapi"\s*:/.test(text) ||
      text.trimStart().startsWith('[') ||
      text.trimStart().startsWith('{')
    ) {
      return {
        host,
        port,
        kind: 'postgrest',
        baseUrl,
        label: `PostgREST · ${host}:${port}`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

type ProbeJob = { host: string; port: number; kind: LanServiceKind };

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      if (signal?.aborted) return;
      const i = idx++;
      await worker(items[i]!);
    }
  });
  await Promise.all(runners);
}

export type LanScanResult = {
  hits: LanScanHit[];
  deviceIp: string | null;
  prefix: string;
  /** IP alınamadıysa varsayılan subnet kullanıldı */
  usedFallbackSubnet: boolean;
};

/**
 * /24 subnet’te tipik portları paralel HTTP probe ile tara.
 */
export async function scanLanServers(
  options: LanScanOptions = {},
): Promise<LanScanResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const signal = options.signal;

  let deviceIp = await getDeviceLanIp();
  let usedFallbackSubnet = false;
  let prefix: string;

  if (deviceIp) {
    prefix = subnetPrefix(deviceIp);
  } else if (options.hintHost && isPrivateIpv4(options.hintHost.trim())) {
    prefix = subnetPrefix(options.hintHost.trim());
    usedFallbackSubnet = true;
  } else {
    prefix = '192.168.1';
    usedFallbackSubnet = true;
  }

  const extras: string[] = [];
  if (deviceIp) extras.push(deviceIp);
  if (options.hintHost && isValidIpv4(options.hintHost)) {
    extras.push(options.hintHost.trim());
  }
  if (Platform.OS === 'android') {
    extras.push('10.0.2.2'); // emülatör → host PC
  }

  const hosts = buildHostList(prefix, extras);

  const jobs: ProbeJob[] = [];
  // Öncelik: hint + gateway + emulator önce (liste başında)
  const priorityHosts = extras.filter((h) => isValidIpv4(h));
  const prioritySet = new Set(priorityHosts);
  const orderedHosts = [
    ...priorityHosts,
    ...hosts.filter((h) => !prioritySet.has(h)),
  ];

  for (const host of orderedHosts) {
    for (const port of BRIDGE_PORTS) {
      jobs.push({ host, port, kind: 'bridge' });
    }
    for (const port of POSTGREST_PORTS) {
      jobs.push({ host, port, kind: 'postgrest' });
    }
  }

  const hits: LanScanHit[] = [];
  const seen = new Set<string>();
  let done = 0;
  const total = jobs.length;

  options.onProgress?.({ done: 0, total, found: 0 });

  await runPool(
    jobs,
    concurrency,
    async (job) => {
      if (signal?.aborted) return;
      const hit =
        job.kind === 'bridge'
          ? await probeBridge(job.host, job.port, timeoutMs, signal)
          : await probePostgrest(job.host, job.port, timeoutMs, signal);
      done += 1;
      let newHit: LanScanHit | undefined;
      if (hit) {
        const key = `${hit.kind}:${hit.host}:${hit.port}`;
        if (!seen.has(key)) {
          seen.add(key);
          hits.push(hit);
          newHit = hit;
        }
      }
      options.onProgress?.({
        done,
        total,
        found: hits.length,
        currentHost: job.host,
        hit: newHit,
      });
    },
    signal,
  );

  hits.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'bridge' ? -1 : 1;
    if (a.host !== b.host) return a.host.localeCompare(b.host, undefined, { numeric: true });
    return a.port - b.port;
  });

  return { hits, deviceIp, prefix, usedFallbackSubnet };
}

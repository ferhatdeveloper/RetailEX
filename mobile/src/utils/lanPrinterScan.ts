/**
 * LAN ağ yazıcı taraması — ESC/POS ham TCP (9100, 9101, 9102).
 * Development build: doğrudan TCP probe (react-native-tcp-socket).
 * Expo Go: pg_bridge `/api/scale/rongta/lan-scan` (genel TCP port taraması).
 */

import { getDeviceLanIp, isPrivateIpv4, isValidIpv4 } from './lanServerScan';
import { getBridgeBaseUrl, useConfigStore } from '../store/configStore';
import {
  isNativeScaleTcpAvailable,
  probeTcpPort,
} from '../services/scale/rongtaTcpNative';

export const PRINTER_LAN_PROBE_PORTS = [9100, 9101, 9102] as const;

export type DiscoveredPrinter = {
  ip: string;
  port: number;
  responseMs: number;
};

export type LanPrinterScanProgress = {
  done: number;
  total: number;
  found: number;
  currentHost?: string;
  hit?: DiscoveredPrinter;
};

export type LanPrinterScanOptions = {
  timeoutMs?: number;
  concurrency?: number;
  ports?: readonly number[];
  hintHost?: string;
  signal?: AbortSignal;
  onProgress?: (p: LanPrinterScanProgress) => void;
  /** true ise yalnızca doğrudan TCP (bridge yok) */
  directOnly?: boolean;
};

function subnetPrefix(ip: string): string {
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function buildHostList(prefix: string, extras: string[]): string[] {
  const set = new Set<string>();
  for (const h of extras) {
    if (h && isValidIpv4(h)) set.add(h.trim());
  }
  set.add(`${prefix}.1`);
  for (let i = 1; i <= 254; i++) set.add(`${prefix}.${i}`);
  return Array.from(set);
}

async function scanDirect(
  hosts: string[],
  ports: readonly number[],
  timeoutMs: number,
  concurrency: number,
  signal: AbortSignal | undefined,
  onProgress?: (p: LanPrinterScanProgress) => void,
): Promise<DiscoveredPrinter[]> {
  const found: DiscoveredPrinter[] = [];
  const jobs: Array<{ host: string; port: number }> = [];
  for (const host of hosts) {
    for (const port of ports) jobs.push({ host, port });
  }
  let done = 0;
  const total = jobs.length;
  let idx = 0;

  const worker = async () => {
    while (idx < jobs.length) {
      if (signal?.aborted) return;
      const job = jobs[idx++];
      if (!job) return;
      onProgress?.({
        done,
        total,
        found: found.length,
        currentHost: `${job.host}:${job.port}`,
      });
      const r = await probeTcpPort(job.host, job.port, timeoutMs);
      done += 1;
      if (r.ok) {
        const hit: DiscoveredPrinter = {
          ip: job.host,
          port: job.port,
          responseMs: r.ms,
        };
        found.push(hit);
        onProgress?.({ done, total, found: found.length, hit });
      } else {
        onProgress?.({ done, total, found: found.length });
      }
    }
  };

  const n = Math.max(1, Math.min(concurrency, 40));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return found;
}

async function scanViaBridge(
  deviceIp: string | null,
  ports: readonly number[],
  timeoutMs: number,
  hintHost?: string,
): Promise<DiscoveredPrinter[]> {
  const bridgeUrl = getBridgeBaseUrl(useConfigStore.getState().config);
  let response: Response;
  try {
    response = await fetch(`${bridgeUrl}/api/scale/rongta/lan-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceIp,
        hintHost,
        ports: [...ports],
        timeoutMs,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `LAN tarama köprüsüne ulaşılamadı. Doğrudan TCP için development build gerekir. ${msg}`,
    );
  }
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    error?: string;
    hits?: Array<{ ip: string; port: number; responseMs?: number; reachable?: boolean }>;
  };
  if (!response.ok) {
    throw new Error(json.message || json.error || `HTTP ${response.status}`);
  }
  if (!Array.isArray(json.hits)) return [];
  return json.hits
    .filter((h) => h && typeof h.ip === 'string' && typeof h.port === 'number')
    .map((h) => ({
      ip: h.ip,
      port: h.port,
      responseMs: Number(h.responseMs) || 0,
    }));
}

/**
 * Alt ağ /24 TCP port taraması (9100, 9101, 9102).
 */
export async function scanLanPrinters(
  options: LanPrinterScanOptions = {},
): Promise<DiscoveredPrinter[]> {
  const timeoutMs = options.timeoutMs ?? 350;
  const concurrency = options.concurrency ?? 28;
  const ports = options.ports ?? PRINTER_LAN_PROBE_PORTS;
  const deviceIp = await getDeviceLanIp();
  const hint = options.hintHost?.trim();

  if (isNativeScaleTcpAvailable()) {
    if (!deviceIp || !isPrivateIpv4(deviceIp)) {
      if (!options.directOnly) {
        try {
          return await scanViaBridge(deviceIp, ports, timeoutMs, hint);
        } catch {
          /* fallthrough */
        }
      }
      return [];
    }
    const hosts = buildHostList(subnetPrefix(deviceIp), hint ? [hint] : []);
    return await scanDirect(
      hosts,
      ports,
      timeoutMs,
      concurrency,
      options.signal,
      options.onProgress,
    );
  }

  if (options.directOnly) {
    return [];
  }

  return await scanViaBridge(deviceIp, ports, timeoutMs, hint);
}

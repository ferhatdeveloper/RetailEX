/**
 * LAN terazi tarama — TeraziManager `LanScaleScanner` eşleniği.
 * Development build: doğrudan TCP probe (react-native-tcp-socket).
 * Expo Go: pg_bridge `/api/scale/rongta/lan-scan` (PC aynı Wi‑Fi alt ağında tarar).
 */

import { getDeviceLanIp, isPrivateIpv4, isValidIpv4 } from '../../utils/lanServerScan';
import { getBridgeBaseUrl, useConfigStore } from '../../store/configStore';
import {
  isNativeScaleTcpAvailable,
  probeTcpPort,
} from './rongtaTcpNative';
import { RONGTA_LAN_PROBE_PORTS } from './rongtaProtocol';

export type DiscoveredScale = {
  ip: string;
  port: number;
  reachable: boolean;
  responseMs: number;
};

export type LanScaleScanProgress = {
  done: number;
  total: number;
  found: number;
  currentHost?: string;
  hit?: DiscoveredScale;
};

export type LanScaleScanOptions = {
  timeoutMs?: number;
  concurrency?: number;
  ports?: readonly number[];
  hintHost?: string;
  signal?: AbortSignal;
  onProgress?: (p: LanScaleScanProgress) => void;
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
  onProgress?: (p: LanScaleScanProgress) => void,
): Promise<DiscoveredScale[]> {
  const found: DiscoveredScale[] = [];
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
        const hit: DiscoveredScale = {
          ip: job.host,
          port: job.port,
          reachable: true,
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
): Promise<DiscoveredScale[]> {
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
    hits?: DiscoveredScale[];
  };
  if (!response.ok) {
    throw new Error(json.message || json.error || `HTTP ${response.status}`);
  }
  return Array.isArray(json.hits) ? json.hits : [];
}

/**
 * Alt ağ /24 TCP port taraması (5001, 9100, 4001, 20304).
 */
export async function scanLanScales(
  options: LanScaleScanOptions = {},
): Promise<{
  hits: DiscoveredScale[];
  via: 'direct' | 'bridge';
  deviceIp: string | null;
  message: string;
}> {
  const timeoutMs = options.timeoutMs ?? 350;
  const concurrency = options.concurrency ?? 28;
  const ports = options.ports ?? RONGTA_LAN_PROBE_PORTS;
  const deviceIp = await getDeviceLanIp();
  const hint = options.hintHost?.trim();

  if (isNativeScaleTcpAvailable()) {
    if (!deviceIp || !isPrivateIpv4(deviceIp)) {
      if (!options.directOnly) {
        try {
          const hits = await scanViaBridge(deviceIp, ports, timeoutMs, hint);
          return {
            hits,
            via: 'bridge',
            deviceIp,
            message: `Köprü taraması: ${hits.length} terazi (cihaz IP alınamadı)`,
          };
        } catch {
          /* fallthrough */
        }
      }
      return {
        hits: [],
        via: 'direct',
        deviceIp,
        message: 'Cihaz Wi‑Fi IPv4 alınamadı — aynı ağa bağlanın veya IP’yi elle girin.',
      };
    }
    const hosts = buildHostList(subnetPrefix(deviceIp), hint ? [hint] : []);
    const hits = await scanDirect(
      hosts,
      ports,
      timeoutMs,
      concurrency,
      options.signal,
      options.onProgress,
    );
    return {
      hits,
      via: 'direct',
      deviceIp,
      message: `Doğrudan TCP: ${hits.length} açık port (${deviceIp} /24)`,
    };
  }

  if (options.directOnly) {
    return {
      hits: [],
      via: 'direct',
      deviceIp,
      message: 'Doğrudan TCP yok — development build + react-native-tcp-socket gerekir.',
    };
  }

  const hits = await scanViaBridge(deviceIp, ports, timeoutMs, hint);
  return {
    hits,
    via: 'bridge',
    deviceIp,
    message: `Köprü LAN tarama: ${hits.length} terazi`,
  };
}

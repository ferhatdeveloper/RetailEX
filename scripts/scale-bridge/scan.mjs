/**
 * Yerel ağda Rongta terazi taraması (TCP probe).
 */
import os from 'node:os';
import net from 'node:net';
import { rongtaTcpQuickProbe } from './rongtaTcp.mjs';
import { parseScalePortsList, SCALE_PORTS_CSV } from './scalePorts.mjs';

const FALLBACK_PORTS = parseScalePortsList(null);
const DEFAULT_CONCURRENCY = 48;
const TCP_PROBE_TIMEOUT_MS = 500;

function parsePortsList(ports) {
  return parseScalePortsList(ports);
}

function parseIp(ip) {
  const parts = String(ip || '').trim().split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error('Geçersiz IP adresi');
  }
  return parts;
}

function expandRange(startIP, endIP) {
  const start = parseIp(startIP);
  const end = parseIp(endIP);
  if (start[0] !== end[0] || start[1] !== end[1] || start[2] !== end[2]) {
    throw new Error('IP aralığı aynı /24 alt ağında olmalı (ilk 3 oktet aynı)');
  }
  if (start[3] > end[3]) throw new Error('Başlangıç IP, bitiş IP\'den büyük olamaz');
  const base = `${start[0]}.${start[1]}.${start[2]}`;
  const list = [];
  for (let i = start[3]; i <= end[3]; i += 1) list.push(`${base}.${i}`);
  return list;
}

function isPrivateIPv4(parts) {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function subnetRangeFromIp(ip) {
  const parts = parseIp(ip);
  const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
  return { startIP: `${base}.1`, endIP: `${base}.254`, sourceIp: ip };
}

function guessLocalSubnets() {
  const nets = os.networkInterfaces();
  const seen = new Set();
  const ranges = [];

  for (const entries of Object.values(nets)) {
    for (const entry of entries || []) {
      const family = entry.family;
      if (family !== 'IPv4' && family !== 4) continue;
      if (entry.internal) continue;
      try {
        const parts = parseIp(entry.address);
        if (!isPrivateIPv4(parts)) continue;
        const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
        if (seen.has(base)) continue;
        seen.add(base);
        ranges.push(subnetRangeFromIp(entry.address));
      } catch {
        /* geçersiz adres */
      }
    }
  }

  if (ranges.length === 0) {
    return [{ startIP: '192.168.1.1', endIP: '192.168.1.254', sourceIp: null }];
  }

  return ranges.sort((a, b) => {
    const aParts = parseIp(a.sourceIp || a.startIP);
    const bParts = parseIp(b.sourceIp || b.startIP);
    for (let i = 0; i < 4; i += 1) {
      if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
    }
    return 0;
  });
}

function guessLocalSubnet() {
  const subnets = guessLocalSubnets();
  const primary = subnets[0];
  return {
    startIP: primary.startIP,
    endIP: primary.endIP,
    sourceIp: primary.sourceIp || null,
    subnets,
  };
}

function tryTcpPort(ip, port, timeoutMs = TCP_PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try {
      socket.connect(port, ip);
    } catch {
      finish(false);
    }
  });
}

async function probeHost(ip, ports = FALLBACK_PORTS) {
  for (const port of ports) {
    try {
      const verified = await rongtaTcpQuickProbe(ip, port);
      if (verified?.ok) {
        return {
          ipAddress: ip,
          port: verified.port || port,
          brand: 'rongta',
          model: 'RLS1000/RLS1100',
          isResponding: true,
        };
      }
    } catch {
      /* sonraki port */
    }
  }
  return null;
}

async function mapPool(items, concurrency, worker) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function resolveScanRanges(opts = {}) {
  if (opts.startIP && opts.endIP) {
    return [{ startIP: opts.startIP, endIP: opts.endIP }];
  }
  if (opts.startIP || opts.endIP) {
    const defaults = guessLocalSubnet();
    return [{
      startIP: opts.startIP || defaults.startIP,
      endIP: opts.endIP || defaults.endIP,
    }];
  }
  return guessLocalSubnets().map(({ startIP, endIP }) => ({ startIP, endIP }));
}

/**
 * @param {{ startIP?: string, endIP?: string, concurrency?: number, onProgress?: (p: object) => void }} opts
 */
export async function scanNetworkForScales(opts = {}) {
  const ranges = resolveScanRanges(opts);
  const ports = parsePortsList(opts.ports);
  const concurrency = Number(opts.concurrency) > 0 ? Number(opts.concurrency) : DEFAULT_CONCURRENCY;
  const hosts = [...new Set(ranges.flatMap((r) => expandRange(r.startIP, r.endIP)))];
  const found = [];
  let done = 0;

  await mapPool(hosts, concurrency, async (ip) => {
    const hit = await probeHost(ip, ports);
    done += 1;
    if (opts.onProgress) {
      opts.onProgress({ current: done, total: hosts.length, currentIP: ip, found: found.length });
    }
    if (hit) found.push(hit);
    return hit;
  });

  const primary = ranges[0];
  return {
    startIP: primary.startIP,
    endIP: primary.endIP,
    ranges,
    ports,
    scanned: hosts.length,
    devices: found.sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true })),
  };
}

export { guessLocalSubnet, guessLocalSubnets, expandRange, parsePortsList, SCALE_PORTS_CSV };

/**
 * Yerel ağda Rongta terazi taraması.
 * İki aşama: (1) TCP port açık mı, (2) Rongta protokolü doğrulama.
 * Yoğun taramada yalnızca protokol şartı cihazları kaçırır; TCP adayları da listelenir.
 */
import os from 'node:os';
import net from 'node:net';
import { rongtaTcpQuickProbe } from './rongtaTcp.mjs';
import { parseScalePortsList, SCALE_PORTS_CSV } from './scalePorts.mjs';
import { SCAN_TCP_TIMEOUT_MS } from './sdk/rongta/transport.mjs';

const FALLBACK_PORTS = parseScalePortsList(null);
const DEFAULT_CONCURRENCY = 32;
const PROTOCOL_CONCURRENCY = 6;

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

function tryTcpPort(ip, port, timeoutMs = SCAN_TCP_TIMEOUT_MS) {
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

async function findOpenScalePorts(ip, ports = FALLBACK_PORTS, tcpTimeoutMs = SCAN_TCP_TIMEOUT_MS) {
  const open = [];
  for (const port of ports) {
    // eslint-disable-next-line no-await-in-loop
    if (await tryTcpPort(ip, port, tcpTimeoutMs)) open.push(port);
  }
  return open;
}

async function verifyRongtaProtocol(ip, ports) {
  for (const port of ports) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const verified = await rongtaTcpQuickProbe(ip, port);
      if (verified?.ok) {
        return { ok: true, port: verified.port || port };
      }
    } catch {
      /* sonraki port */
    }
  }
  return { ok: false };
}

/**
 * Tek IP için keşif: önce TCP, sonra protokol; protokol yoksa TCP adayı döner.
 * @param {string} ip
 * @param {number[]} ports
 * @param {{ tcpTimeoutMs?: number, includeTcpCandidates?: boolean, openPorts?: number[] }} opts
 */
async function probeHost(ip, ports = FALLBACK_PORTS, opts = {}) {
  const tcpTimeoutMs = Number(opts.tcpTimeoutMs) > 0 ? Number(opts.tcpTimeoutMs) : SCAN_TCP_TIMEOUT_MS;
  const includeTcpCandidates = opts.includeTcpCandidates !== false;

  const openPorts = Array.isArray(opts.openPorts) && opts.openPorts.length
    ? opts.openPorts
    : await findOpenScalePorts(ip, ports, tcpTimeoutMs);
  if (!openPorts.length) return null;

  const protocol = await verifyRongtaProtocol(ip, openPorts);
  if (protocol.ok) {
    return {
      ipAddress: ip,
      port: protocol.port,
      brand: 'rongta',
      model: 'RLS1000/RLS1100',
      isResponding: true,
      protocolVerified: true,
      discoveryMethod: 'protocol',
    };
  }

  if (!includeTcpCandidates) return null;

  const preferred = openPorts[0];
  return {
    ipAddress: ip,
    port: preferred,
    brand: 'rongta',
    model: 'RLS1000/RLS1100 (TCP adayı)',
    isResponding: true,
    protocolVerified: false,
    discoveryMethod: 'tcp',
    openPorts,
  };
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
  if (opts.allSubnets === false) {
    const primary = guessLocalSubnet();
    return [{ startIP: primary.startIP, endIP: primary.endIP }];
  }
  return guessLocalSubnets().map(({ startIP, endIP }) => ({ startIP, endIP }));
}

/**
 * @param {{
 *   startIP?: string,
 *   endIP?: string,
 *   concurrency?: number,
 *   allSubnets?: boolean,
 *   includeTcpCandidates?: boolean,
 *   tcpTimeoutMs?: number,
 *   onProgress?: (p: object) => void
 * }} opts
 */
export async function scanNetworkForScales(opts = {}) {
  const ranges = resolveScanRanges(opts);
  const ports = parsePortsList(opts.ports);
  const concurrency = Number(opts.concurrency) > 0 ? Number(opts.concurrency) : DEFAULT_CONCURRENCY;
  const protocolConcurrency = Math.min(concurrency, PROTOCOL_CONCURRENCY);
  const hosts = [...new Set(ranges.flatMap((r) => expandRange(r.startIP, r.endIP)))];
  const found = [];
  let done = 0;

  // Aşama 1: hızlı TCP taraması
  const tcpHits = [];
  await mapPool(hosts, concurrency, async (ip) => {
    const openPorts = await findOpenScalePorts(
      ip,
      ports,
      Number(opts.tcpTimeoutMs) > 0 ? Number(opts.tcpTimeoutMs) : SCAN_TCP_TIMEOUT_MS
    );
    done += 1;
    if (opts.onProgress) {
      opts.onProgress({
        phase: 'tcp',
        current: done,
        total: hosts.length,
        currentIP: ip,
        found: found.length,
      });
    }
    if (openPorts.length) tcpHits.push({ ip, openPorts });
    return openPorts.length ? { ip, openPorts } : null;
  });

  // Aşama 2: protokol doğrulama (düşük eşzamanlılık — terazi yüklenmesin)
  let protoDone = 0;
  await mapPool(tcpHits, protocolConcurrency, async ({ ip, openPorts }) => {
    const hit = await probeHost(ip, ports, {
      ...opts,
      openPorts,
      includeTcpCandidates: opts.includeTcpCandidates !== false,
    });
    protoDone += 1;
    if (opts.onProgress) {
      opts.onProgress({
        phase: 'protocol',
        current: protoDone,
        total: tcpHits.length,
        currentIP: ip,
        found: found.length,
      });
    }
    if (hit) found.push(hit);
    return hit;
  });

  const primary = ranges[0];
  const protocolVerified = found.filter((d) => d.protocolVerified).length;
  const tcpOnly = found.filter((d) => !d.protocolVerified).length;

  return {
    startIP: primary.startIP,
    endIP: primary.endIP,
    ranges,
    ports,
    scanned: hosts.length,
    tcpCandidates: tcpHits.length,
    protocolVerified,
    tcpOnly,
    devices: found.sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true })),
  };
}

export { guessLocalSubnet, guessLocalSubnets, expandRange, parsePortsList, SCALE_PORTS_CSV, probeHost, findOpenScalePorts };

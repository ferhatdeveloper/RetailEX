/**
 * Yerel ağda Rongta terazi taraması (TCP probe).
 */
import { rongtaTcpTest } from './rongtaTcp.mjs';

const FALLBACK_PORTS = [20304, 4001, 9100, 1024];
const DEFAULT_CONCURRENCY = 24;

function parseIp(ip) {
  const parts = String(ip || '').trim().split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error('Geçersiz IP adresi');
  }
  return parts;
}

function ipToString(parts) {
  return parts.join('.');
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

function guessLocalSubnet() {
  return { startIP: '192.168.1.1', endIP: '192.168.1.254' };
}

async function probeHost(ip, ports = FALLBACK_PORTS) {
  for (const port of ports) {
    try {
      const result = await rongtaTcpTest(ip, port);
      if (result?.ok) {
        return {
          ipAddress: ip,
          port: result.port || port,
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

/**
 * @param {{ startIP?: string, endIP?: string, concurrency?: number, onProgress?: (p: object) => void }} opts
 */
export async function scanNetworkForScales(opts = {}) {
  const defaults = guessLocalSubnet();
  const startIP = opts.startIP || defaults.startIP;
  const endIP = opts.endIP || defaults.endIP;
  const concurrency = Number(opts.concurrency) > 0 ? Number(opts.concurrency) : DEFAULT_CONCURRENCY;
  const hosts = expandRange(startIP, endIP);
  const found = [];
  let done = 0;

  await mapPool(hosts, concurrency, async (ip) => {
    const hit = await probeHost(ip);
    done += 1;
    if (opts.onProgress) {
      opts.onProgress({ current: done, total: hosts.length, currentIP: ip, found: found.length });
    }
    if (hit) found.push(hit);
    return hit;
  });

  return {
    startIP,
    endIP,
    scanned: hosts.length,
    devices: found.sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true })),
  };
}

export { guessLocalSubnet, expandRange };

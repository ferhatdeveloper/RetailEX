/**
 * RLS1000 «background» modu — terazi PC'ye TCP ile bağlanır.
 * C# TeraziRongta / RLS1000 yazılımı bu yönde çalışır: PC dinler, terazi bağlanır.
 */
import net from 'node:net';
import { buildStartAckPacket, isRongtaFrame, RONGTA_CMD } from './sdk/rongta/protocol.mjs';
import { readFrame, writePacket } from './sdk/rongta/transport.mjs';
import { parseScalePortsList } from './scalePorts.mjs';

const DEFAULT_INBOUND_PORTS = [20304, 4001, 8888, 3000, 9200, 19204];

/** @type {Map<string, { ipAddress: string, listenPort: number, connectedAt: string, lastSeen: string, initiatedBy: 'scale' }>} */
const inboundRegistry = new Map();

const servers = [];

function normalizeClientIp(addr) {
  const raw = String(addr || '');
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  return raw;
}

function registryKey(ip, listenPort) {
  return `${ip}:${listenPort}`;
}

export function getInboundScales() {
  return [...inboundRegistry.values()].map((row) => ({
    ipAddress: row.ipAddress,
    port: 20304,
    listenPort: row.listenPort,
    brand: 'rongta',
    model: 'RLS1000/RLS1100 (gelen bağlantı)',
    isResponding: true,
    protocolVerified: true,
    discoveryMethod: 'inbound',
    connectedAt: row.connectedAt,
    lastSeen: row.lastSeen,
  }));
}

export function clearInboundRegistry() {
  inboundRegistry.clear();
}

async function handleInboundConnection(socket, listenPort) {
  const ipAddress = normalizeClientIp(socket.remoteAddress);
  const now = new Date().toISOString();
  const key = registryKey(ipAddress, listenPort);

  const register = () => {
    inboundRegistry.set(key, {
      ipAddress,
      listenPort,
      connectedAt: inboundRegistry.get(key)?.connectedAt || now,
      lastSeen: now,
      initiatedBy: 'scale',
    });
    console.log(`[scale-bridge] Gelen terazi bağlantısı: ${ipAddress} → dinleme portu ${listenPort}`);
  };

  try {
    const initial = await readFrame(socket, 4000);
    if (initial && isRongtaFrame(initial)) {
      const cmd = String(initial).slice(4, 8);
      if (cmd === RONGTA_CMD.START) {
        await writePacket(socket, buildStartAckPacket());
      }
      register();
    } else if (initial && initial.length > 0) {
      register();
    } else {
      register();
    }
  } catch (e) {
    console.warn(`[scale-bridge] Gelen bağlantı handshake (${ipAddress}:${listenPort}):`, e instanceof Error ? e.message : e);
    register();
  } finally {
    socket.destroy();
  }
}

function startInboundServer(port, host = '0.0.0.0') {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      handleInboundConnection(socket, port).catch((e) => {
        console.warn('[scale-bridge] inbound handler:', e);
      });
    });
    server.on('error', (err) => {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
        console.warn(`[scale-bridge] Dinleme portu ${port} kullanımda — atlanıyor`);
        resolve(null);
        return;
      }
      reject(err);
    });
    server.listen(port, host, () => {
      console.log(`[scale-bridge] Terazi dinleme: ${host}:${port} (gelen TCP)`);
      resolve(server);
    });
  });
}

/**
 * @param {{ enabled?: boolean, host?: string, ports?: number[] | string }} opts
 */
export async function startScaleInboundListeners(opts = {}) {
  await stopScaleInboundListeners();
  if (opts.enabled === false) return { started: [], skipped: [] };

  const host = opts.host || '0.0.0.0';
  const ports = parseScalePortsList(opts.ports ?? DEFAULT_INBOUND_PORTS);
  const started = [];
  const skipped = [];

  for (const port of ports) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const srv = await startInboundServer(port, host);
      if (srv) {
        servers.push(srv);
        started.push(port);
      } else {
        skipped.push({ port, reason: 'EADDRINUSE' });
      }
    } catch (e) {
      skipped.push({ port, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return { started, skipped };
}

export async function stopScaleInboundListeners() {
  await Promise.all(servers.map((s) => new Promise((resolve) => {
    try { s.close(() => resolve()); } catch { resolve(); }
  })));
  servers.length = 0;
}

export { DEFAULT_INBOUND_PORTS };

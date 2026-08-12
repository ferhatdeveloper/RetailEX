/**
 * Rongta RLS TCP istemcisi (Node.js) — pg_bridge tarafında kullanılır.
 * Protokol: src/utils/rongtaRlsProtocol.ts
 */

import net from 'node:net';
import {
  buildRongtaPacket,
  buildRongtaPluBody,
  buildRongtaRequestSalesPacket,
  buildRongtaStartAckPacket,
  buildRongtaStartPacket,
  buildRongtaTestPluRecord,
  parseRongtaAck,
  parseRongtaPacket,
  parseRongtaSalesRecord,
  type RongtaPluRecord,
  type RongtaSalesRecord,
  RONGTA_CMD,
  RONGTA_FALLBACK_PORTS,
  RONGTA_TEST_DISPLAY_TEXT,
} from '../utils/rongtaRlsProtocol';

const SOCKET_TIMEOUT_MS = 8000;

function parseAck(raw: string): { ok: boolean; errorCode: string; raw: string } {
  const ack = parseRongtaAck(raw);
  if (!ack) return { ok: false, errorCode: '????', raw: raw.trim() };
  return { ok: ack.ok, errorCode: ack.errorCode, raw: ack.raw };
}

async function performHandshake(socket: net.Socket) {
  const initial = await Promise.race([
    readOnce(socket, 1500),
    new Promise<string>((r) => setTimeout(() => r(''), 1500)),
  ]);

  if (initial.includes(RONGTA_CMD.START)) {
    await writePacket(socket, buildRongtaStartAckPacket());
  } else {
    await writePacket(socket, buildRongtaStartPacket());
    await readOnce(socket, 3000);
  }
}

function readOnce(socket: net.Socket, timeoutMs = SOCKET_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      cleanup();
      resolve(buf);
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buf += chunk.toString('ascii');
      if (buf.length >= 8) {
        const len = parseInt(buf.slice(0, 4), 10);
        if (Number.isFinite(len) && buf.length >= len) {
          cleanup();
          resolve(buf.slice(0, len));
        }
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

function writePacket(socket: net.Socket, packet: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(packet, 'ascii', (err) => (err ? reject(err) : resolve()));
  });
}

function tryConnect(ip: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(SOCKET_TIMEOUT_MS);
    socket.once('error', reject);
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Bağlantı zaman aşımı'));
    });
    socket.connect(port, ip, () => {
      socket.setTimeout(0);
      resolve(socket);
    });
  });
}

async function resolveSocket(ipAddress: string, port?: number) {
  const ports = port
    ? [port, ...RONGTA_FALLBACK_PORTS.filter((p) => p !== port)]
    : [...RONGTA_FALLBACK_PORTS];
  let lastErr: unknown = null;
  for (const p of ports) {
    try {
      const socket = await tryConnect(ipAddress, p);
      return { socket, port: p };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Teraziye bağlanılamadı');
}

export async function rongtaTcpTest(ipAddress: string, port?: number) {
  const testPlu = buildRongtaTestPluRecord();
  const { socket, port: usedPort } = await resolveSocket(ipAddress, port);
  try {
    await performHandshake(socket);

    const packet = buildRongtaPacket(RONGTA_CMD.PLU_SEND, buildRongtaPluBody(testPlu));
    await writePacket(socket, packet);
    const ack = parseAck(await readOnce(socket, 5000));
    return {
      ok: ack.ok,
      port: usedPort,
      displayText: RONGTA_TEST_DISPLAY_TEXT,
      message: ack.ok
        ? `Test başarılı — terazi ekranında "${RONGTA_TEST_DISPLAY_TEXT}" görünmeli (PLU 99)`
        : `Bağlantı var ancak test PLU gönderilemedi (hata ${ack.errorCode})`,
    };
  } catch (e) {
    return {
      ok: false,
      port: usedPort,
      displayText: RONGTA_TEST_DISPLAY_TEXT,
      message: e instanceof Error ? e.message : 'Terazi test hatası',
    };
  } finally {
    socket.destroy();
  }
}

export async function rongtaTcpSendPlu(
  ipAddress: string,
  port: number | undefined,
  records: RongtaPluRecord[]
) {
  const { socket, port: usedPort } = await resolveSocket(ipAddress, port);
  const errors: string[] = [];
  let sentCount = 0;

  try {
    await performHandshake(socket);

    for (const rec of records) {
      const packet = buildRongtaPacket(RONGTA_CMD.PLU_SEND, buildRongtaPluBody(rec));
      await writePacket(socket, packet);
      const ackRaw = await readOnce(socket, 5000);
      const ack = parseAck(ackRaw);
      if (ack.ok) {
        sentCount += 1;
      } else {
        errors.push(`${rec.name}: hata ${ack.errorCode}`);
      }
    }

    return {
      success: errors.length === 0,
      message:
        errors.length === 0
          ? `${sentCount} ürün Rongta terazisine gönderildi (port ${usedPort})`
          : `${sentCount} gönderildi, ${errors.length} hata`,
      sentCount,
      failedCount: records.length - sentCount,
      errors: errors.length ? errors : undefined,
      port: usedPort,
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Terazi iletişim hatası',
      sentCount,
      failedCount: records.length - sentCount,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  } finally {
    socket.destroy();
  }
}

/** PLU temizleme — açık TCP protokolünde clear komutu yok; operate=D ile silme. */
export async function rongtaTcpClearPlu(
  ipAddress: string,
  port: number | undefined,
  records: RongtaPluRecord[]
) {
  const deletes = records.map((r) => ({ ...r, operate: 'D' as const }));
  const result = await rongtaTcpSendPlu(ipAddress, port, deletes);
  return {
    ...result,
    message: result.success
      ? `${result.sentCount} PLU silindi (operate=D, port ${result.port ?? port})`
      : result.message,
  };
}

/** Alt ağ TCP port taraması (TeraziManager LanScaleScanner). */
export async function rongtaTcpLanScan(options?: {
  deviceIp?: string | null;
  hintHost?: string;
  ports?: number[];
  timeoutMs?: number;
}) {
  const timeoutMs = options?.timeoutMs ?? 350;
  const ports = options?.ports?.length
    ? options.ports
    : [5001, 9100, 4001, 20304];
  const hint = options?.hintHost?.trim();
  const baseIp = (options?.deviceIp || hint || '').trim();
  const prefix = baseIp
    ? baseIp.split('.').slice(0, 3).join('.')
    : null;
  if (!prefix || prefix.split('.').length !== 3) {
    return {
      success: false,
      message: 'deviceIp veya hintHost (IPv4) gerekli — örn. telefon/PC LAN IP',
      hits: [] as Array<{ ip: string; port: number; reachable: boolean; responseMs: number }>,
    };
  }

  const hosts: string[] = [];
  if (hint) hosts.push(hint);
  for (let i = 1; i <= 254; i++) hosts.push(`${prefix}.${i}`);
  const unique = [...new Set(hosts)];
  const hits: Array<{ ip: string; port: number; reachable: boolean; responseMs: number }> = [];
  const concurrency = 40;
  let idx = 0;

  const probe = (host: string, port: number) =>
    new Promise<{ ok: boolean; ms: number }>((resolve) => {
      const t0 = Date.now();
      const socket = new net.Socket();
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok, ms: Date.now() - t0 });
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      socket.once('error', () => finish(false));
      socket.connect(port, host, () => finish(true));
    });

  const worker = async () => {
    while (idx < unique.length * ports.length) {
      const job = idx++;
      const host = unique[Math.floor(job / ports.length)]!;
      const port = ports[job % ports.length]!;
      const r = await probe(host, port);
      if (r.ok) hits.push({ ip: host, port, reachable: true, responseMs: r.ms });
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return {
    success: true,
    message: `${hits.length} açık terazi portu (${prefix}.0/24)`,
    hits,
  };
}

export async function rongtaTcpFetchSales(
  ipAddress: string,
  port?: number,
  options?: { maxRecords?: number; timeoutMs?: number }
) {
  const maxRecords = options?.maxRecords ?? 500;
  const timeoutMs = options?.timeoutMs ?? 15000;
  const { socket, port: usedPort } = await resolveSocket(ipAddress, port);
  const records: RongtaSalesRecord[] = [];

  try {
    await performHandshake(socket);
    await writePacket(socket, buildRongtaRequestSalesPacket());

    const deadline = Date.now() + timeoutMs;
    while (records.length < maxRecords && Date.now() < deadline) {
      const raw = await readOnce(socket, Math.min(3000, deadline - Date.now()));
      if (!raw || raw.length < 8) continue;
      const pkt = parseRongtaPacket(raw);
      if (!pkt) continue;

      if (pkt.command === RONGTA_CMD.SALES_END) break;
      if (pkt.command === RONGTA_CMD.SALES_RECORD) {
        const rec = parseRongtaSalesRecord(pkt.data);
        if (rec) records.push(rec);
      }
      if (pkt.command === RONGTA_CMD.ACK) {
        const ack = parseAck(raw);
        if (!ack.ok) break;
      }
    }

    return {
      success: true,
      port: usedPort,
      count: records.length,
      records,
      message: records.length
        ? `${records.length} satış kaydı alındı (port ${usedPort})`
        : `Satış kaydı yok veya terazi yanıt vermedi (port ${usedPort})`,
    };
  } catch (e) {
    return {
      success: false,
      port: usedPort,
      count: records.length,
      records,
      message: e instanceof Error ? e.message : 'Satış kaydı okuma hatası',
    };
  } finally {
    socket.destroy();
  }
}

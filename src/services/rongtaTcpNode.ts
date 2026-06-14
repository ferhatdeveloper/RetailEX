/**
 * Rongta RLS TCP istemcisi (Node.js) — pg_bridge tarafında kullanılır.
 */

import net from 'node:net';
import {
  buildRongtaPacket,
  buildRongtaPluBody,
  buildRongtaStartAckPacket,
  buildRongtaStartPacket,
  buildRongtaTestPluRecord,
  type RongtaPluRecord,
  RONGTA_CMD,
  RONGTA_FALLBACK_PORTS,
  RONGTA_TEST_DISPLAY_TEXT,
} from '../utils/rongtaRlsProtocol';

const SOCKET_TIMEOUT_MS = 8000;

function parseAck(raw: string): { ok: boolean; errorCode: string; raw: string } {
  const s = raw.trim();
  if (s.length < 8) return { ok: false, errorCode: '????', raw: s };
  const cmd = s.slice(4, 8);
  if (cmd !== RONGTA_CMD.ACK) return { ok: true, errorCode: '0000', raw: s };
  const data = s.slice(8);
  const errorCode = data.length >= 14 ? data.slice(-4) : '0000';
  return { ok: errorCode === '0000', errorCode, raw: s };
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
  const ports = port ? [port] : [...RONGTA_FALLBACK_PORTS];
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

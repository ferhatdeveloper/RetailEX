/**
 * Doğrudan telefon → terazi TCP (development build + react-native-tcp-socket).
 * Expo Go'da native yok → köprü yolu kullanılır.
 */

import {
  RONGTA_CMD,
  RONGTA_FALLBACK_PORTS,
  RONGTA_TEST_DISPLAY_TEXT,
  buildRongtaPluPacket,
  buildRongtaRequestSalesPacket,
  buildRongtaStartAckPacket,
  buildRongtaStartPacket,
  buildRongtaTestPluRecord,
  parseAckRaw,
  parseRongtaPacket,
  parseRongtaSalesRecord,
  type RongtaPluRecord,
  type RongtaSalesRecord,
} from './rongtaProtocol';
import type { ScaleSyncResult } from '../../types/scale';

type TcpSocketClient = {
  write: (data: string, encoding?: string, cb?: (err?: Error) => void) => void;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  off?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
};

type TcpSocketModule = {
  createConnection: (
    options: { port: number; host: string },
    callback: () => void,
  ) => TcpSocketClient;
};

let nativeProbeDone = false;
let nativeAvailable = false;

function tryLoadTcpSocket(): TcpSocketModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-tcp-socket') as TcpSocketModule;
  } catch {
    return null;
  }
}

export function isNativeScaleTcpAvailable(): boolean {
  if (!nativeProbeDone) {
    nativeAvailable = tryLoadTcpSocket() !== null;
    nativeProbeDone = true;
  }
  return nativeAvailable;
}

export function nativeScaleTcpDevBuildHint(): string {
  return (
    'Doğrudan terazi TCP (telefon → IP:port) Expo Go’da çalışmaz. ' +
    'Development build + `npx expo install react-native-tcp-socket` gerekir. ' +
    'Expo Go’da pg_bridge köprüsü (PC LAN) kullanılır.'
  );
}

const CONNECT_TIMEOUT_MS = 3500;
const SOCKET_TIMEOUT_MS = 8000;

function removeListener(
  client: TcpSocketClient,
  event: string,
  cb: (...args: unknown[]) => void,
) {
  if (typeof client.off === 'function') client.off(event, cb);
  else if (typeof client.removeListener === 'function') client.removeListener(event, cb);
}

function connectHost(host: string, port: number): Promise<TcpSocketClient> {
  const mod = tryLoadTcpSocket();
  if (!mod) return Promise.reject(new Error(nativeScaleTcpDevBuildHint()));

  return new Promise((resolve, reject) => {
    let settled = false;
    let client: TcpSocketClient | null = null;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client?.destroy();
      reject(new Error(`Bağlantı zaman aşımı ${host}:${port}`));
    }, CONNECT_TIMEOUT_MS);

    try {
      client = mod.createConnection({ port, host }, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(client!);
      });
      client.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    } catch (e) {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function writeAscii(client: TcpSocketClient, packet: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.write(packet, 'ascii', (err) => (err ? reject(err) : resolve()));
  });
}

function readOnce(client: TcpSocketClient, timeoutMs = SOCKET_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      cleanup();
      resolve(buf);
    }, timeoutMs);

    const onData = (...args: unknown[]) => {
      const chunk = args[0];
      if (typeof chunk === 'string') buf += chunk;
      else if (chunk && typeof (chunk as { toString?: () => string }).toString === 'function') {
        buf += (chunk as { toString: (enc?: string) => string }).toString('ascii');
      }
      if (buf.length >= 8) {
        const len = parseInt(buf.slice(0, 4), 10);
        if (Number.isFinite(len) && buf.length >= len) {
          cleanup();
          resolve(buf.slice(0, len));
        }
      }
    };

    const onError = (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const cleanup = () => {
      clearTimeout(timer);
      removeListener(client, 'data', onData);
      removeListener(client, 'error', onError);
    };

    client.on('data', onData);
    client.on('error', onError);
  });
}

async function performHandshake(client: TcpSocketClient) {
  const initial = await Promise.race([
    readOnce(client, 1500),
    new Promise<string>((r) => setTimeout(() => r(''), 1500)),
  ]);
  if (initial.includes(RONGTA_CMD.START)) {
    await writeAscii(client, buildRongtaStartAckPacket());
  } else {
    await writeAscii(client, buildRongtaStartPacket());
    await readOnce(client, 3000);
  }
}

export async function probeTcpPort(
  host: string,
  port: number,
  timeoutMs = 350,
): Promise<{ ok: boolean; ms: number }> {
  const mod = tryLoadTcpSocket();
  if (!mod) return { ok: false, ms: 0 };
  const t0 = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    let client: TcpSocketClient | null = null;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        client?.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok, ms: Date.now() - t0 });
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      client = mod.createConnection({ port, host }, () => finish(true));
      client.on('error', () => finish(false));
    } catch {
      finish(false);
    }
  });
}

async function resolveSocket(ipAddress: string, port?: number) {
  const ports = port
    ? [port, ...RONGTA_FALLBACK_PORTS.filter((p) => p !== port)]
    : [...RONGTA_FALLBACK_PORTS];
  let lastErr: unknown = null;
  for (const p of ports) {
    try {
      const socket = await connectHost(ipAddress, p);
      return { socket, port: p };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Teraziye bağlanılamadı');
}

export async function nativeRongtaTest(ipAddress: string, port?: number) {
  const testPlu = buildRongtaTestPluRecord();
  const { socket, port: usedPort } = await resolveSocket(ipAddress, port);
  try {
    await performHandshake(socket);
    await writeAscii(socket, buildRongtaPluPacket(testPlu));
    const ack = parseAckRaw(await readOnce(socket, 5000));
    return {
      ok: ack.ok,
      port: usedPort,
      displayText: RONGTA_TEST_DISPLAY_TEXT,
      via: 'direct' as const,
      message: ack.ok
        ? `Doğrudan TCP test OK — ekranda "${RONGTA_TEST_DISPLAY_TEXT}" (PLU 99)`
        : `Bağlantı var ancak test PLU başarısız (hata ${ack.errorCode})`,
    };
  } catch (e) {
    return {
      ok: false,
      port: usedPort,
      displayText: RONGTA_TEST_DISPLAY_TEXT,
      via: 'direct' as const,
      message: e instanceof Error ? e.message : 'Terazi test hatası',
    };
  } finally {
    socket.destroy();
  }
}

export async function nativeRongtaSendPlu(
  ipAddress: string,
  port: number | undefined,
  records: RongtaPluRecord[],
): Promise<ScaleSyncResult & { port?: number; via: 'direct' }> {
  const { socket, port: usedPort } = await resolveSocket(ipAddress, port);
  const errors: string[] = [];
  let sentCount = 0;
  try {
    await performHandshake(socket);
    for (const rec of records) {
      await writeAscii(socket, buildRongtaPluPacket(rec));
      const ack = parseAckRaw(await readOnce(socket, 5000));
      if (ack.ok) sentCount += 1;
      else errors.push(`${rec.name}: hata ${ack.errorCode}`);
    }
    return {
      success: errors.length === 0,
      message:
        errors.length === 0
          ? `${sentCount} ürün doğrudan TCP (port ${usedPort})`
          : `${sentCount} gönderildi, ${errors.length} hata`,
      productCount: records.length,
      sentCount,
      failedCount: records.length - sentCount,
      errors,
      port: usedPort,
      via: 'direct',
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Terazi iletişim hatası',
      productCount: records.length,
      sentCount,
      failedCount: records.length - sentCount,
      errors: [e instanceof Error ? e.message : String(e)],
      via: 'direct',
    };
  } finally {
    socket.destroy();
  }
}

export async function nativeRongtaFetchSales(
  ipAddress: string,
  port?: number,
  options?: { maxRecords?: number; timeoutMs?: number },
) {
  const maxRecords = options?.maxRecords ?? 500;
  const timeoutMs = options?.timeoutMs ?? 15000;
  const { socket, port: usedPort } = await resolveSocket(ipAddress, port);
  const records: RongtaSalesRecord[] = [];
  try {
    await performHandshake(socket);
    await writeAscii(socket, buildRongtaRequestSalesPacket());
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
        const ack = parseAckRaw(raw);
        if (!ack.ok) break;
      }
    }
    return {
      success: true,
      port: usedPort,
      via: 'direct' as const,
      count: records.length,
      records,
      message: records.length
        ? `${records.length} satış (doğrudan TCP port ${usedPort})`
        : `Satış yok / yanıt yok (doğrudan TCP port ${usedPort})`,
    };
  } catch (e) {
    return {
      success: false,
      port: usedPort,
      via: 'direct' as const,
      count: records.length,
      records,
      message: e instanceof Error ? e.message : 'Satış okuma hatası',
    };
  } finally {
    socket.destroy();
  }
}

/** PLU temizleme — açık protokol: operate=D ile kayıt silme (SDK clearPludata alternatifi). */
export async function nativeRongtaClearPlu(
  ipAddress: string,
  port: number | undefined,
  records: RongtaPluRecord[],
): Promise<ScaleSyncResult & { via: 'direct' }> {
  const deletes = records.map((r) => ({ ...r, operate: 'D' as const }));
  const r = await nativeRongtaSendPlu(ipAddress, port, deletes);
  return {
    ...r,
    message: r.success
      ? `${r.sentCount} PLU silindi (operate=D, doğrudan TCP)`
      : r.message,
  };
}

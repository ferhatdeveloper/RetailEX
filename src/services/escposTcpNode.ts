/**
 * Ham ESC/POS TCP gönderimi (Node.js) — pg_bridge `/api/printer/escpos-tcp`.
 * DeskApp `print_escpos_tcp` ile aynı mantık: raw socket, varsayılan port 9100.
 */

import net from 'node:net';

const CONNECT_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 15000;
const DEFAULT_PORT = 9100;

function clampPort(port: number | undefined): number {
  const p = Number(port);
  if (!Number.isFinite(p) || p < 1 || p > 65535) return DEFAULT_PORT;
  return Math.floor(p);
}

function connectTcp(host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setNoDelay(true);

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const timer = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error(`Bağlantı zaman aşımı (${CONNECT_TIMEOUT_MS / 1000} sn): ${host}:${port}`));
    }, CONNECT_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('error', onError);
      socket.off('connect', onConnect);
    };

    const onConnect = () => {
      cleanup();
      resolve(socket);
    };

    socket.on('error', onError);
    socket.once('connect', onConnect);
    socket.connect(port, host);
  });
}

function writeAll(socket: net.Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Gönderim zaman aşımı (${WRITE_TIMEOUT_MS / 1000} sn).`));
    }, WRITE_TIMEOUT_MS);

    socket.write(data, (err) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    });
  });
}

export type EscposTcpSendResult = {
  ok: boolean;
  message: string;
  bytesSent?: number;
};

/** Ağ termaline ham ESC/POS bayt gönderir. */
export async function escposTcpSend(
  host: string,
  port: number | undefined,
  data: Uint8Array | Buffer,
): Promise<EscposTcpSendResult> {
  const trimmed = host.trim();
  if (!trimmed) {
    return { ok: false, message: 'Yazıcı adresi (IP/host) boş.' };
  }

  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (payload.length === 0) {
    return { ok: false, message: 'ESC/POS verisi boş.' };
  }

  const safePort = clampPort(port);
  let socket: net.Socket | null = null;

  try {
    socket = await connectTcp(trimmed, safePort);
    await writeAll(socket, payload);
    return {
      ok: true,
      message: `ESC/POS gönderildi → ${trimmed}:${safePort} (${payload.length} bayt)`,
      bytesSent: payload.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `TCP ${trimmed}:${safePort} — ${msg}` };
  } finally {
    socket?.destroy();
  }
}

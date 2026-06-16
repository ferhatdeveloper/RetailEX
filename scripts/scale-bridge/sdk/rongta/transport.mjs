/**
 * Rongta TCP taşıma katmanı.
 */
import net from 'node:net';
import { buildScalePortTryList } from '../../scalePorts.mjs';
import { SCALE_PRINTER_PORTS } from '../../scalePorts.mjs';

export const SOCKET_TIMEOUT_MS = 8000;
export const QUICK_PROBE_TIMEOUT_MS = 2500;
export const QUICK_CONNECT_TIMEOUT_MS = 1200;
export const SCAN_TCP_TIMEOUT_MS = 900;

export function errorCode(err) {
  if (!err) return '';
  if (typeof err === 'object' && 'code' in err) return String(err.code);
  const m = String(err.message || err);
  const match = m.match(/\b(ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND)\b/);
  return match ? match[1] : '';
}

export function readOnce(socket, timeoutMs = SOCKET_TIMEOUT_MS) {
  return readFrame(socket, timeoutMs);
}

/** Tam Rongta paketi oku (TCP parçalanmasına dayanıklı). */
export function readFrame(socket, timeoutMs = SOCKET_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
    };

    const tryResolve = () => {
      const buf = Buffer.concat(chunks).toString('ascii');
      if (buf.length < 4) return false;
      const len = parseInt(buf.slice(0, 4), 10);
      if (!Number.isFinite(len) || len < 8) return false;
      if (len > 16384) {
        cleanup();
        reject(new Error('Geçersiz paket uzunluğu'));
        return true;
      }
      if (buf.length >= len) {
        cleanup();
        resolve(buf.slice(0, len));
        return true;
      }
      return false;
    };

    const onData = (chunk) => {
      chunks.push(chunk);
      tryResolve();
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    timer = setTimeout(() => {
      cleanup();
      const partial = Buffer.concat(chunks).toString('ascii');
      resolve(partial);
    }, timeoutMs);

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

export function writePacket(socket, packet) {
  return new Promise((resolve, reject) => {
    socket.write(packet, 'ascii', (err) => (err ? reject(err) : resolve()));
  });
}

export function tryConnect(ip, port, timeoutMs = SOCKET_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('error', reject);
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Bağlantı zaman aşımı')); });
    socket.connect(port, ip, () => { socket.setTimeout(0); resolve(socket); });
  });
}

export function buildPortList(preferredPort) {
  return buildScalePortTryList(preferredPort).filter((p) => !SCALE_PRINTER_PORTS.has(p));
}

export async function resolveSocket(ipAddress, port) {
  const ports = buildPortList(port);
  let lastErr = null;
  for (const p of ports) {
    try { return { socket: await tryConnect(ipAddress, p), port: p }; }
    catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('Teraziye bağlanılamadı');
}

export function tcpConnectCheck(ip, port, timeoutMs = QUICK_CONNECT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ port, reachable: true, refused: false }));
    socket.once('timeout', () => finish({ port, reachable: false, refused: false, timeout: true }));
    socket.once('error', (err) => {
      const code = errorCode(err);
      finish({
        port,
        reachable: false,
        refused: code === 'ECONNREFUSED',
        timeout: code === 'ETIMEDOUT',
        hostUnreachable: code === 'EHOSTUNREACH' || code === 'ENOTFOUND',
        error: err instanceof Error ? err.message : String(err),
        code,
      });
    });
    try {
      socket.connect(port, ip);
    } catch (err) {
      finish({ port, reachable: false, error: String(err), code: errorCode(err) });
    }
  });
}

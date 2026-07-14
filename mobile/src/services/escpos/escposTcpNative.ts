/**
 * İsteğe bağlı doğrudan TCP — `react-native-tcp-socket` (development build).
 * Expo Go'da native modül yok; köprü yolu kullanılır (bkz. printerBridge.ts).
 */

import { uint8ToBase64 } from './escposBytes';

export type NativeTcpResult = {
  ok: boolean;
  message: string;
  bytesSent?: number;
};

let nativeProbeDone = false;
let nativeAvailable = false;

type TcpSocketClient = {
  write: (data: string, encoding: 'base64', cb?: (err?: Error) => void) => void;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};

type TcpSocketModule = {
  createConnection: (
    options: { port: number; host: string },
    callback: () => void,
  ) => TcpSocketClient;
};

function tryLoadTcpSocket(): TcpSocketModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-tcp-socket') as TcpSocketModule;
  } catch {
    return null;
  }
}

export function isNativeTcpAvailable(): boolean {
  if (!nativeProbeDone) {
    nativeAvailable = tryLoadTcpSocket() !== null;
    nativeProbeDone = true;
  }
  return nativeAvailable;
}

export function nativeTcpDevBuildHint(): string {
  return (
    'Doğrudan ağ yazıcısı (telefon → yazıcı) Expo Go’da çalışmaz. ' +
    'Development build + `npx expo install react-native-tcp-socket` gerekir. ' +
    'Expo Go’da pg_bridge köprüsü kullanılır (Config → Bridge host = PC LAN IP).'
  );
}

const CONNECT_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 15000;
const DEFAULT_PORT = 9100;

function clampPort(port: number | undefined): number {
  const p = Number(port);
  if (!Number.isFinite(p) || p < 1 || p > 65535) return DEFAULT_PORT;
  return Math.floor(p);
}

/** Telefondan doğrudan ham ESC/POS TCP (9100). */
export async function nativeEscposTcpSend(
  host: string,
  port: number | undefined,
  payload: Uint8Array,
): Promise<NativeTcpResult> {
  const mod = tryLoadTcpSocket();
  if (!mod) {
    return { ok: false, message: nativeTcpDevBuildHint() };
  }

  const trimmed = host.trim();
  if (!trimmed) return { ok: false, message: 'Yazıcı adresi (IP) boş.' };
  if (payload.length === 0) return { ok: false, message: 'ESC/POS verisi boş.' };

  const safePort = clampPort(port);
  const dataB64 = uint8ToBase64(payload);

  return new Promise((resolve) => {
    let settled = false;
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    let client: TcpSocketClient | null = null;

    const finish = (result: NativeTcpResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      if (writeTimer) clearTimeout(writeTimer);
      resolve(result);
    };

    const connectTimer = setTimeout(() => {
      client?.destroy();
      finish({
        ok: false,
        message: `Bağlantı zaman aşımı (${CONNECT_TIMEOUT_MS / 1000} sn): ${trimmed}:${safePort}`,
      });
    }, CONNECT_TIMEOUT_MS);

    try {
      client = mod.createConnection({ port: safePort, host: trimmed }, () => {
        clearTimeout(connectTimer);
        writeTimer = setTimeout(() => {
          client?.destroy();
          finish({ ok: false, message: `Gönderim zaman aşımı (${WRITE_TIMEOUT_MS / 1000} sn).` });
        }, WRITE_TIMEOUT_MS);

        client!.write(dataB64, 'base64', (err) => {
          if (writeTimer) clearTimeout(writeTimer);
          client?.destroy();
          if (err) {
            finish({ ok: false, message: `TCP gönderim: ${err.message}` });
          } else {
            finish({
              ok: true,
              message: `ESC/POS gönderildi (doğrudan TCP) → ${trimmed}:${safePort} (${payload.length} bayt)`,
              bytesSent: payload.length,
            });
          }
        });
      });

      client.on('error', (err) => {
        finish({
          ok: false,
          message: `TCP ${trimmed}:${safePort} — ${err instanceof Error ? err.message : String(err)}`,
        });
      });
    } catch (e) {
      finish({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  });
}

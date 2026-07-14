/**
 * ESC/POS ağ yazdırma taşıyıcısı — öncelik sırası:
 * 1. pg_bridge (Expo Go + PC köprüsü — terazi ile aynı)
 * 2. react-native-tcp-socket (development build, telefon → yazıcı doğrudan)
 */

import { bridgeEscposTcpSend } from '../printerBridge';
import { isNativeTcpAvailable, nativeEscposTcpSend, nativeTcpDevBuildHint } from './escposTcpNative';

export type EscposTransportKind = 'bridge' | 'native-tcp' | 'unavailable';

export type EscposSendResult = {
  ok: boolean;
  message: string;
  transport?: EscposTransportKind;
  bytesSent?: number;
};

export function escposTransportStatus(): {
  bridge: 'always';
  nativeTcp: boolean;
  hint: string;
} {
  return {
    bridge: 'always',
    nativeTcp: isNativeTcpAvailable(),
    hint: isNativeTcpAvailable()
      ? 'Köprü veya doğrudan TCP kullanılabilir.'
      : nativeTcpDevBuildHint(),
  };
}

/**
 * Ham ESC/POS baytını ağ yazıcısına gönderir.
 * Köprü önce denenir; başarısız olursa native TCP (varsa) denenir.
 */
export async function sendEscposOverNetwork(
  host: string,
  port: number | undefined,
  payload: Uint8Array,
  options?: { preferNative?: boolean },
): Promise<EscposSendResult> {
  const trimmed = host.trim();
  if (!trimmed) return { ok: false, message: 'Ağ yazıcısı için IP adresi girin.' };

  const tryBridge = async (): Promise<EscposSendResult> => {
    try {
      const res = await bridgeEscposTcpSend(trimmed, port, payload);
      return { ...res, transport: 'bridge' };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        transport: 'bridge',
      };
    }
  };

  const tryNative = async (): Promise<EscposSendResult> => {
    if (!isNativeTcpAvailable()) {
      return { ok: false, message: nativeTcpDevBuildHint(), transport: 'unavailable' };
    }
    const res = await nativeEscposTcpSend(trimmed, port, payload);
    return { ...res, transport: res.ok ? 'native-tcp' : 'native-tcp' };
  };

  if (options?.preferNative && isNativeTcpAvailable()) {
    const nativeRes = await tryNative();
    if (nativeRes.ok) return nativeRes;
    const bridgeRes = await tryBridge();
    if (bridgeRes.ok) return bridgeRes;
    return {
      ok: false,
      message: `${nativeRes.message}\n\nKöprü denemesi: ${bridgeRes.message}`,
      transport: 'unavailable',
    };
  }

  const bridgeRes = await tryBridge();
  if (bridgeRes.ok) return bridgeRes;

  if (isNativeTcpAvailable()) {
    const nativeRes = await tryNative();
    if (nativeRes.ok) return nativeRes;
    return {
      ok: false,
      message: `${bridgeRes.message}\n\nDoğrudan TCP: ${nativeRes.message}`,
      transport: 'unavailable',
    };
  }

  return {
    ok: false,
    message: `${bridgeRes.message}\n\n${nativeTcpDevBuildHint()}`,
    transport: 'unavailable',
  };
}

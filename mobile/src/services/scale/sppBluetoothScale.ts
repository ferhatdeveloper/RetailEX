/**
 * Classic Bluetooth SPP (RFCOMM) — BLE’ye ek.
 * Rongta etiket terazileri genelde TCP; bazı tartılar SPP ASCII kg yayınlar.
 *
 * Hedef SDK: `react-native-bluetooth-classic` (development build).
 * Expo Go: native yok.
 */

import { parseAsciiWeight } from './weightParse';
import type { LiveWeightReading } from '../../types/scale';

export type SppDeviceHit = {
  id: string;
  name: string;
  address: string;
};

let probeDone = false;
let nativeAvailable = false;
let BTClassic: {
  getBondedDevices?: () => Promise<Array<{ id?: string; address?: string; name?: string }>>;
  connectToDevice?: (id: string) => Promise<{ connected?: boolean }>;
  disconnectFromDevice?: (id: string) => Promise<void>;
  onDeviceRead?: (
    id: string,
    listener: (event: { data?: string }) => void,
  ) => { remove: () => void };
} | null = null;

function tryLoad(): typeof BTClassic {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-bluetooth-classic').default
      ?? require('react-native-bluetooth-classic');
  } catch {
    return null;
  }
}

export function isSppNativeAvailable(): boolean {
  if (!probeDone) {
    BTClassic = tryLoad();
    nativeAvailable = BTClassic != null;
    probeDone = true;
  }
  return nativeAvailable;
}

export function sppDevBuildHint(): string {
  return (
    'Klasik Bluetooth SPP Expo Go’da çalışmaz. Development build + ' +
    '`react-native-bluetooth-classic` gerekir. Rongta etiket terazileri için TCP/LAN tercih edin; ' +
    'SPP çoğunlukla tartım tartıları (ASCII kg) içindir.'
  );
}

export function sppTransportStatus(): { available: boolean; hint: string } {
  return {
    available: isSppNativeAvailable(),
    hint: isSppNativeAvailable()
      ? 'SPP native hazır — eşleşmiş cihazlar listelenir.'
      : sppDevBuildHint(),
  };
}

const lastWeightByAddr = new Map<string, LiveWeightReading>();
const subsByAddr = new Map<string, { remove: () => void }>();

export async function scanSppBondedDevices(): Promise<SppDeviceHit[]> {
  if (!isSppNativeAvailable() || !BTClassic?.getBondedDevices) {
    return [];
  }
  const list = await BTClassic.getBondedDevices();
  return (list ?? []).map((d) => {
    const address = String(d.address ?? d.id ?? '');
    return {
      id: address,
      address,
      name: String(d.name ?? address ?? 'SPP'),
    };
  });
}

export async function connectSppScale(
  address: string,
): Promise<{ ok: boolean; message: string; reading: LiveWeightReading }> {
  const addr = address.trim();
  if (!addr) {
    return {
      ok: false,
      message: 'SPP adres gerekli',
      reading: {
        connected: false,
        weightKg: null,
        stable: false,
        detail: 'Adres yok',
        source: 'bluetooth',
      },
    };
  }
  if (!isSppNativeAvailable() || !BTClassic?.connectToDevice) {
    return {
      ok: false,
      message: sppDevBuildHint(),
      reading: {
        connected: false,
        weightKg: null,
        stable: false,
        detail: 'SPP native yok',
        source: 'bluetooth',
      },
    };
  }

  try {
    await BTClassic.connectToDevice(addr);
    if (BTClassic.onDeviceRead && !subsByAddr.has(addr)) {
      const sub = BTClassic.onDeviceRead(addr, (event) => {
        const data = event?.data ?? '';
        if (!data) return;
        const parsed = parseAsciiWeight(data);
        if (!parsed) return;
        lastWeightByAddr.set(addr, {
          connected: true,
          weightKg: parsed.weightKg,
          stable: parsed.stable,
          detail: parsed.detail || 'SPP',
          source: 'bluetooth',
        });
      });
      subsByAddr.set(addr, sub);
    }
    return {
      ok: true,
      message: `SPP bağlandı: ${addr}`,
      reading: lastWeightByAddr.get(addr) ?? {
        connected: true,
        weightKg: null,
        stable: false,
        detail: 'SPP bağlı — tartım bekleniyor',
        source: 'bluetooth',
      },
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      reading: {
        connected: false,
        weightKg: null,
        stable: false,
        detail: 'SPP bağlantı hatası',
        source: 'bluetooth',
      },
    };
  }
}

export async function disconnectSppScale(address: string): Promise<void> {
  const addr = address.trim();
  const sub = subsByAddr.get(addr);
  try {
    sub?.remove();
  } catch {
    /* ignore */
  }
  subsByAddr.delete(addr);
  lastWeightByAddr.delete(addr);
  if (BTClassic?.disconnectFromDevice && addr) {
    try {
      await BTClassic.disconnectFromDevice(addr);
    } catch {
      /* ignore */
    }
  }
}

export function getSppLiveReading(address: string): LiveWeightReading {
  return (
    lastWeightByAddr.get(address.trim()) ?? {
      connected: false,
      weightKg: null,
      stable: false,
      detail: 'SPP okuma yok',
      source: 'bluetooth',
    }
  );
}

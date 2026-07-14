/**
 * react-native-ble-plx sarmalayıcı — Expo Go'da native modül yok.
 * Development build + app.json plugin gerekli (bkz. mobile/README.md).
 */

import { PermissionsAndroid, Platform } from 'react-native';
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import type { LiveWeightReading } from '../../types/scale';
import { parseBleWeightPayload } from './weightParse';

/** Bluetooth SIG + sık kullanılan NUS / custom tartı UUID'leri */
export const BLE_WEIGHT_SERVICE = '0000181d-0000-1000-8000-00805f9b34fb';
export const BLE_WEIGHT_MEASUREMENT = '00002a9d-0000-1000-8000-00805f9b34fb';
export const NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NORDIC_UART_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export type BleScanHit = {
  id: string;
  name: string;
  rssi: number | null;
};

let managerSingleton: BleManager | null | undefined;
let nativeProbeDone = false;
let nativeAvailable = false;

function tryCreateManager(): BleManager | null {
  if (managerSingleton !== undefined) return managerSingleton;
  try {
    // Expo Go: NativeModules.BLECentralManager null → createClient patlar
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager: BleManagerCtor } = require('react-native-ble-plx') as {
      BleManager: new () => BleManager;
    };
    managerSingleton = new BleManagerCtor();
    nativeAvailable = true;
    return managerSingleton;
  } catch {
    managerSingleton = null;
    nativeAvailable = false;
    return null;
  } finally {
    nativeProbeDone = true;
  }
}

export function isBleNativeAvailable(): boolean {
  if (!nativeProbeDone) tryCreateManager();
  return nativeAvailable;
}

export function getBleManager(): BleManager | null {
  return tryCreateManager();
}

export function bleDevBuildHint(): string {
  return (
    'Bluetooth tartı Expo Go’da çalışmaz. Development build gerekir: ' +
    '`npx expo prebuild` → `npx expo run:android` (veya EAS development). ' +
    'Plugin: app.json → react-native-ble-plx. Ayrıntı: mobile/README.md#terazi-ble-development-build'
  );
}

export async function ensureBlePermissions(): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, message: 'Web’de BLE yok' };
  }
  if (!isBleNativeAvailable()) {
    return { ok: false, message: bleDevBuildHint() };
  }
  if (Platform.OS !== 'android') {
    return { ok: true, message: 'OK' };
  }
  const api = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  try {
    if (api >= 31) {
      const r = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      const scanOk = r['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED;
      const connOk =
        r['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED;
      if (!scanOk || !connOk) {
        return { ok: false, message: 'Bluetooth tarama/bağlantı izni reddedildi' };
      }
    } else {
      const r = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Konum (BLE tarama)',
          message: 'Android, BLE cihaz taraması için konum izni ister.',
          buttonPositive: 'İzin ver',
          buttonNegative: 'İptal',
        },
      );
      if (r !== PermissionsAndroid.RESULTS.GRANTED) {
        return { ok: false, message: 'Konum izni reddedildi (BLE tarama için gerekli)' };
      }
    }
    return { ok: true, message: 'OK' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function scanBleDevices(timeoutMs = 8000): Promise<BleScanHit[]> {
  const perm = await ensureBlePermissions();
  if (!perm.ok) throw new Error(perm.message);
  const mgr = getBleManager();
  if (!mgr) throw new Error(bleDevBuildHint());

  const found = new Map<string, BleScanHit>();
  await mgr.stopDeviceScan().catch(() => undefined);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      void mgr.stopDeviceScan();
      resolve([...found.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)));
    }, timeoutMs);

    mgr.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        clearTimeout(timer);
        void mgr.stopDeviceScan();
        reject(new Error(error.message || String(error)));
        return;
      }
      if (!device?.id) return;
      const name = (device.name || device.localName || '').trim();
      // isimsiz de ekle ama düşük öncelik; tartı genelde adlı
      found.set(device.id, {
        id: device.id,
        name: name || `BLE ${device.id.slice(-8)}`,
        rssi: device.rssi ?? null,
      });
    });
  });
}

type Session = {
  deviceId: string;
  deviceName: string;
  connected: boolean;
  lastReading: LiveWeightReading;
  subscriptions: Subscription[];
  device: Device | null;
};

const sessions = new Map<string, Session>();

function emptyReading(detail: string, connected = false): LiveWeightReading {
  return {
    connected,
    weightKg: null,
    stable: false,
    detail,
    source: 'bluetooth',
  };
}

function applyPayload(session: Session, base64: string | null | undefined) {
  const parsed = parseBleWeightPayload(base64);
  if (!parsed) return;
  session.lastReading = {
    connected: true,
    weightKg: parsed.weightKg,
    stable: parsed.stable,
    detail: parsed.detail,
    source: 'bluetooth',
  };
}

async function monitorAllNotifiable(mgr: BleManager, device: Device, session: Session) {
  const services = await device.services();
  for (const svc of services) {
    const chars = await device.characteristicsForService(svc.uuid);
    for (const ch of chars) {
      if (!ch.isNotifiable && !ch.isIndicatable) continue;
      try {
        const sub = mgr.monitorCharacteristicForDevice(
          device.id,
          svc.uuid,
          ch.uuid,
          (error, characteristic) => {
            if (error || !characteristic) return;
            applyPayload(session, characteristic.value);
          },
        );
        session.subscriptions.push(sub);
      } catch {
        // bazı karakteristikler abone olmayı reddeder — devam
      }
    }
  }

  // Profil UUID'lerini ayrıca dene (bazı stack’ler listede gecikmeli)
  try {
    const sub = mgr.monitorCharacteristicForDevice(
      device.id,
      BLE_WEIGHT_SERVICE,
      BLE_WEIGHT_MEASUREMENT,
      (error, characteristic) => {
        if (error || !characteristic) return;
        applyPayload(session, characteristic.value);
      },
    );
    session.subscriptions.push(sub);
  } catch {
    /* yoksa normal */
  }
  try {
    const sub = mgr.monitorCharacteristicForDevice(
      device.id,
      NORDIC_UART_SERVICE,
      NORDIC_UART_TX,
      (error, characteristic) => {
        if (error || !characteristic) return;
        applyPayload(session, characteristic.value);
      },
    );
    session.subscriptions.push(sub);
  } catch {
    /* yoksa normal */
  }
}

export async function connectBleScale(
  address: string,
): Promise<{ ok: boolean; message: string; reading: LiveWeightReading }> {
  const id = address.trim();
  if (!id) {
    return {
      ok: false,
      message: 'BT adres boş',
      reading: emptyReading('Adres yok'),
    };
  }

  const perm = await ensureBlePermissions();
  if (!perm.ok) {
    return { ok: false, message: perm.message, reading: emptyReading(perm.message) };
  }
  const mgr = getBleManager();
  if (!mgr) {
    const msg = bleDevBuildHint();
    return { ok: false, message: msg, reading: emptyReading(msg) };
  }

  await disconnectBleScale(id);

  try {
    const device = await mgr.connectToDevice(id, { autoConnect: false, timeout: 12000 });
    await device.discoverAllServicesAndCharacteristics();
    const session: Session = {
      deviceId: id,
      deviceName: device.name || device.localName || id,
      connected: true,
      lastReading: emptyReading('Bağlandı — tartım bekleniyor', true),
      subscriptions: [],
      device,
    };
    sessions.set(id, session);
    await monitorAllNotifiable(mgr, device, session);

    // İlk okuma: weight measurement read dene
    try {
      const ch = await mgr.readCharacteristicForDevice(
        id,
        BLE_WEIGHT_SERVICE,
        BLE_WEIGHT_MEASUREMENT,
      );
      applyPayload(session, ch.value);
    } catch {
      /* özellik yok */
    }

    return {
      ok: true,
      message: `BLE bağlandı: ${session.deviceName}`,
      reading: session.lastReading,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `BLE bağlantı hatası: ${msg}`,
      reading: emptyReading(msg),
    };
  }
}

export async function disconnectBleScale(address?: string): Promise<void> {
  const mgr = getBleManager();
  const ids = address?.trim() ? [address.trim()] : [...sessions.keys()];
  for (const id of ids) {
    const session = sessions.get(id);
    if (session) {
      for (const sub of session.subscriptions) {
        try {
          sub.remove();
        } catch {
          /* ignore */
        }
      }
      sessions.delete(id);
    }
    if (mgr) {
      try {
        await mgr.cancelDeviceConnection(id);
      } catch {
        /* ignore */
      }
    }
  }
}

export function getBleLiveReading(address: string): LiveWeightReading {
  const session = sessions.get(address.trim());
  if (!session) return emptyReading('BLE bağlı değil');
  return { ...session.lastReading, connected: session.connected };
}

export function isBleSessionConnected(address: string): boolean {
  return sessions.get(address.trim())?.connected === true;
}

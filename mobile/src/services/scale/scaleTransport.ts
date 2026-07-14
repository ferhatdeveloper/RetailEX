/**
 * ScaleTransport — Android TeraziManager sözleşmesinin RN karşılığı.
 *
 * - network: doğrudan TCP (dev client) → yedek pg_bridge
 * - simulate / bluetooth (BLE|SPP) / usb
 */

import type {
  BluetoothScaleConnection,
  LiveWeightReading,
  ScaleConnectionResult,
  ScaleDevice,
  ScalePluRecord,
  ScaleSaleRecord,
  ScaleSyncResult,
  ScaleTransportKind,
} from '../../types/scale';
import { useScaleStore } from '../../store/scaleStore';
import {
  bleDevBuildHint,
  connectBleScale,
  disconnectBleScale,
  getBleLiveReading,
  isBleNativeAvailable,
  isBleSessionConnected,
  scanBleDevices,
} from './blePlx';
import {
  bridgeRongtaClearPlu,
  bridgeRongtaFetchSales,
  bridgeRongtaSendHotkeys,
  bridgeRongtaSendLabelTemplate,
  bridgeRongtaSendPlu,
  bridgeRongtaTest,
  type RongtaPluPayload,
} from './rongtaBridge';
import { resolveLabelId } from './labelSlotHelper';
import {
  connectSppScale,
  disconnectSppScale,
  getSppLiveReading,
  isSppNativeAvailable,
  scanSppBondedDevices,
  sppDevBuildHint,
} from './sppBluetoothScale';
import {
  isUsbSerialNativeAvailable,
  listUsbSerialDevices,
  usbSerialDevBuildHint,
} from './usbSerialScale';
import { isNativeScaleTcpAvailable } from './rongtaTcpNative';

export interface ScaleTransport {
  readonly kind: ScaleTransportKind;
  readonly displayName: string;
  connect(): Promise<ScaleConnectionResult>;
  disconnect(): Promise<void>;
  testConnection(): Promise<ScaleConnectionResult>;
  readLiveWeight(): Promise<LiveWeightReading>;
  sendPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult>;
  fetchSales(): Promise<{ ok: boolean; message: string; records: ScaleSaleRecord[] }>;
  clearPlu?(records: RongtaPluPayload[]): Promise<ScaleSyncResult>;
  sendHotkeys?(lfCodes: number[]): Promise<{ success: boolean; message: string }>;
  sendLabelTemplate?(slot: string): Promise<{ success: boolean; message: string }>;
}

/** Simüle tartı — rastgele ± kararsız kg. */
export class SimulateScaleTransport implements ScaleTransport {
  readonly kind = 'simulate' as const;
  readonly displayName = 'Simülasyon';
  private connected = false;
  private baseKg = 0.452;

  async connect(): Promise<ScaleConnectionResult> {
    this.connected = true;
    return {
      ok: true,
      message: 'Simülasyon terazisi bağlandı',
      weight: await this.readLiveWeight(),
    };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async testConnection(): Promise<ScaleConnectionResult> {
    this.connected = true;
    return {
      ok: true,
      message: 'Simülasyon test OK — donanım yok',
      displayText: 'SIM SCALE',
      weight: await this.readLiveWeight(),
    };
  }

  async readLiveWeight(): Promise<LiveWeightReading> {
    const jitter = (Math.random() - 0.5) * 0.008;
    const kg = Math.max(0, Math.round((this.baseKg + jitter) * 1000) / 1000);
    this.baseKg = 0.35 + Math.random() * 1.2;
    return {
      connected: this.connected,
      weightKg: kg,
      stable: Math.random() > 0.35,
      detail: this.connected ? 'Simüle tartım' : 'Bağlı değil',
      source: 'simulate',
    };
  }

  async sendPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult> {
    return {
      success: true,
      message: `Simülasyon: ${records.length} PLU kabul edildi (gönderilmedi)`,
      productCount: records.length,
      sentCount: records.length,
      failedCount: 0,
      errors: [],
    };
  }

  async fetchSales() {
    return {
      ok: true,
      message: 'Simülasyon satış kaydı yok',
      records: [] as ScaleSaleRecord[],
    };
  }

  async clearPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult> {
    return {
      success: true,
      message: `Simülasyon: ${records.length} PLU temizlendi`,
      productCount: records.length,
      sentCount: records.length,
      failedCount: 0,
      errors: [],
    };
  }

  async sendHotkeys(lfCodes: number[]) {
    return {
      success: true,
      message: `Simülasyon hotkey: ${lfCodes.length} LFCode tablosu hazır`,
    };
  }

  setSimulatedWeight(kg: number) {
    this.baseKg = Math.max(0, kg);
  }
}

export class NetworkScaleTransport implements ScaleTransport {
  readonly kind = 'network' as const;
  readonly displayName: string;
  private connected = false;

  constructor(
    private readonly ipAddress: string,
    private readonly port: number,
  ) {
    this.displayName = `TCP ${ipAddress}:${port}`;
  }

  async connect(): Promise<ScaleConnectionResult> {
    return this.testConnection();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async testConnection(): Promise<ScaleConnectionResult> {
    try {
      const r = await bridgeRongtaTest(this.ipAddress, this.port);
      this.connected = !!r.ok;
      const via = r.via === 'direct' ? 'doğrudan TCP' : 'köprü';
      return {
        ok: !!r.ok,
        message: `${r.message || (r.ok ? 'Bağlantı başarılı' : 'Bağlantı başarısız')} (${via})`,
        displayText: r.displayText,
        weight: {
          connected: this.connected,
          weightKg: null,
          stable: false,
          detail: r.ok
            ? 'TCP test OK — Rongta etiket terazisi canlı kg yaymaz'
            : 'TCP test başarısız',
          source: 'network',
        },
      };
    } catch (e) {
      this.connected = false;
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async readLiveWeight(): Promise<LiveWeightReading> {
    return {
      connected: this.connected,
      weightKg: null,
      stable: false,
      detail: this.connected
        ? 'LAN Rongta: canlı kg yok — tartılı satışta simülasyon, BLE veya SPP kullanın'
        : 'Bağlı değil',
      source: 'network',
    };
  }

  async sendPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult> {
    const settings = useScaleStore.getState().settings;
    let working = records.map((r) => ({
      ...r,
      labelId: r.labelId ?? resolveLabelId(settings.labelSlot),
    }));

    if (settings.clearBeforeSend && working.length) {
      await bridgeRongtaClearPlu(this.ipAddress, this.port, working);
    }

    const result = await bridgeRongtaSendPlu(this.ipAddress, this.port, working);

    if (settings.sendHotkeys && result.success) {
      const lf = working
        .map((r) => Number(r.lfCode || r.pluCode) || 0)
        .filter((n) => n > 0);
      const hk = await bridgeRongtaSendHotkeys(this.ipAddress, this.port, lf);
      result.message = `${result.message}\n${hk.message}`;
    }

    if (settings.sendLabelOnSync) {
      const lb = await bridgeRongtaSendLabelTemplate(this.ipAddress, settings.labelSlot);
      result.message = `${result.message}\n${lb.message}`;
    }

    return result;
  }

  async fetchSales() {
    try {
      const r = await bridgeRongtaFetchSales(this.ipAddress, this.port);
      const records: ScaleSaleRecord[] = (r.records ?? []).map((row) => ({
        pluName: String(row.pluName ?? ''),
        lfCode: Number(row.lfCode ?? 0),
        weightKg: Number(row.weight ?? 0),
        totalPrice: Number(row.totalPrice ?? 0),
        unitPrice: Number(row.unitPrice ?? 0),
        quantity: Number(row.quantity ?? 1),
        saleDate: row.saleDate ?? null,
      }));
      this.connected = r.success;
      return { ok: r.success, message: r.message, records };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        records: [] as ScaleSaleRecord[],
      };
    }
  }

  async clearPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult> {
    return bridgeRongtaClearPlu(this.ipAddress, this.port, records);
  }

  async sendHotkeys(lfCodes: number[]) {
    return bridgeRongtaSendHotkeys(this.ipAddress, this.port, lfCodes);
  }

  async sendLabelTemplate(slot: string) {
    return bridgeRongtaSendLabelTemplate(this.ipAddress, slot);
  }
}

/**
 * Bluetooth — BLE (ble-plx) veya Classic SPP.
 */
export class BluetoothScaleTransport implements ScaleTransport, BluetoothScaleConnection {
  readonly kind = 'bluetooth' as const;
  readonly displayName: string;
  private readonly profile: 'ble' | 'spp';

  constructor(
    private readonly address: string,
    profile: 'ble' | 'spp' = 'ble',
  ) {
    this.profile = profile;
    this.displayName = `${profile === 'spp' ? 'SPP' : 'BLE'} ${address || '(adres yok)'}`;
  }

  isAvailable(): boolean {
    return this.profile === 'spp' ? isSppNativeAvailable() : isBleNativeAvailable();
  }

  async scan(timeoutMs = 8000): Promise<{ id: string; name: string }[]> {
    if (this.profile === 'spp') {
      const hits = await scanSppBondedDevices();
      return hits.map((h) => ({ id: h.id, name: h.name }));
    }
    const hits = await scanBleDevices(timeoutMs);
    return hits.map((h) => ({ id: h.id, name: h.name }));
  }

  async connect(): Promise<ScaleConnectionResult> {
    return this.testConnection();
  }

  async disconnect(): Promise<void> {
    if (this.profile === 'spp') await disconnectSppScale(this.address);
    else await disconnectBleScale(this.address);
  }

  async testConnection(): Promise<ScaleConnectionResult> {
    if (!this.isAvailable()) {
      return {
        ok: false,
        message: this.profile === 'spp' ? sppDevBuildHint() : bleDevBuildHint(),
        weight: {
          connected: false,
          weightKg: null,
          stable: false,
          detail: 'BT native modül yok (Expo Go)',
          source: 'bluetooth',
        },
      };
    }
    if (this.profile === 'spp') {
      const r = await connectSppScale(this.address);
      return { ok: r.ok, message: r.message, displayText: r.ok ? 'SPP SCALE' : undefined, weight: r.reading };
    }
    const r = await connectBleScale(this.address);
    return {
      ok: r.ok,
      message: r.message,
      displayText: r.ok ? 'BLE SCALE' : undefined,
      weight: r.reading,
    };
  }

  async readLiveWeight(): Promise<LiveWeightReading> {
    if (!this.address.trim()) {
      return {
        connected: false,
        weightKg: null,
        stable: false,
        detail: 'BT adres yok',
        source: 'bluetooth',
      };
    }
    if (!this.isAvailable()) {
      return {
        connected: false,
        weightKg: null,
        stable: false,
        detail: 'BT native yok — development build',
        source: 'bluetooth',
      };
    }
    if (this.profile === 'spp') {
      const r = await connectSppScale(this.address);
      return r.ok ? getSppLiveReading(this.address) : r.reading;
    }
    if (!isBleSessionConnected(this.address)) {
      const r = await connectBleScale(this.address);
      return r.reading;
    }
    return getBleLiveReading(this.address);
  }

  async sendPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult> {
    return {
      success: false,
      message:
        'Bluetooth PLU gönderimi desteklenmiyor — Rongta etiket terazileri TCP/LAN (veya USB seri) kullanır.',
      productCount: records.length,
      sentCount: 0,
      failedCount: records.length,
      errors: ['BT PLU yok'],
    };
  }

  async fetchSales() {
    return {
      ok: false,
      message: 'BT satış raporu yok — TCP/LAN Rongta kullanın',
      records: [] as ScaleSaleRecord[],
    };
  }
}

/** USB-OTG seri — native bağlanınca PLU; şimdilik dürüst durum. */
export class UsbScaleTransport implements ScaleTransport {
  readonly kind = 'usb' as const;
  readonly displayName: string;

  constructor(
    private readonly deviceId: string,
    private readonly baudRate: number,
  ) {
    this.displayName = `USB ${deviceId || '(yok)'} @${baudRate}`;
  }

  async connect(): Promise<ScaleConnectionResult> {
    return this.testConnection();
  }

  async disconnect(): Promise<void> {}

  async testConnection(): Promise<ScaleConnectionResult> {
    if (!isUsbSerialNativeAvailable()) {
      return {
        ok: false,
        message: usbSerialDevBuildHint(),
        weight: {
          connected: false,
          weightKg: null,
          stable: false,
          detail: 'USB native yok',
          source: 'usb',
        },
      };
    }
    const listed = await listUsbSerialDevices(this.baudRate);
    return {
      ok: false,
      message: listed.message,
      weight: {
        connected: false,
        weightKg: null,
        stable: false,
        detail: 'USB Rt2 köprüsü bekleniyor',
        source: 'usb',
      },
    };
  }

  async readLiveWeight(): Promise<LiveWeightReading> {
    return {
      connected: false,
      weightKg: null,
      stable: false,
      detail: isUsbSerialNativeAvailable()
        ? 'USB canlı kg: Android SDK’da sınırlı (TeraziManager ile aynı)'
        : usbSerialDevBuildHint(),
      source: 'usb',
    };
  }

  async sendPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult> {
    return {
      success: false,
      message: usbSerialDevBuildHint(),
      productCount: records.length,
      sentCount: 0,
      failedCount: records.length,
      errors: ['USB PLU native köprü yok'],
    };
  }

  async fetchSales() {
    return {
      ok: false,
      message: 'USB satış: native Rt2Protocol gerekir',
      records: [] as ScaleSaleRecord[],
    };
  }

  async clearPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult> {
    return {
      success: false,
      message: usbSerialDevBuildHint(),
      productCount: records.length,
      sentCount: 0,
      failedCount: records.length,
      errors: ['USB clearPlu native yok'],
    };
  }
}

export {
  scanBleDevices,
  isBleNativeAvailable,
  bleDevBuildHint,
  isNativeScaleTcpAvailable,
  isSppNativeAvailable,
  sppDevBuildHint,
  isUsbSerialNativeAvailable,
  usbSerialDevBuildHint,
  listUsbSerialDevices,
  scanSppBondedDevices,
};

const simulateSingleton = new SimulateScaleTransport();

export function getSimulateTransport(): SimulateScaleTransport {
  return simulateSingleton;
}

export function createScaleTransport(device: ScaleDevice): ScaleTransport {
  switch (device.transport) {
    case 'simulate':
      return getSimulateTransport();
    case 'bluetooth':
      return new BluetoothScaleTransport(
        device.bluetoothAddress ?? '',
        device.bluetoothProfile === 'spp' ? 'spp' : 'ble',
      );
    case 'usb':
      return new UsbScaleTransport(
        device.usbDeviceId ?? device.ipAddress ?? '',
        device.usbBaudRate ?? useScaleStore.getState().settings.usbBaudRate,
      );
    case 'network':
    default:
      return new NetworkScaleTransport(device.ipAddress, device.port);
  }
}

export function pluRecordsToPayload(rows: ScalePluRecord[]): RongtaPluPayload[] {
  const slot = useScaleStore.getState().settings.labelSlot;
  const labelId = resolveLabelId(slot);
  return rows.map((r) => ({
    pluCode: String(r.lfCode || r.pluOrder),
    name: r.pluName,
    price: r.unitPriceCents / 100,
    barcode: r.code,
    lfCode: String(r.lfCode),
    barcodeType: r.barcodeType,
    department: r.department,
    shelfDays: r.shelfDays,
    rank: r.pluOrder,
    operate: 'I' as const,
    labelId,
  }));
}

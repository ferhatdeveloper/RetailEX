/**
 * ScaleTransport — Android TeraziManager `ScaleTransport` sözleşmesinin RN karşılığı.
 *
 * - network: pg_bridge → Rongta TCP (LAN)
 * - simulate: UI / tartılı satış geliştirme (donanım yok)
 * - bluetooth: arayüz hazır; Expo Go'da native BT yok → development build + ble-plx
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
import {
  bridgeRongtaFetchSales,
  bridgeRongtaSendPlu,
  bridgeRongtaTest,
  type RongtaPluPayload,
} from './rongtaBridge';

export interface ScaleTransport {
  readonly kind: ScaleTransportKind;
  readonly displayName: string;
  connect(): Promise<ScaleConnectionResult>;
  disconnect(): Promise<void>;
  testConnection(): Promise<ScaleConnectionResult>;
  readLiveWeight(): Promise<LiveWeightReading>;
  sendPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult>;
  fetchSales(): Promise<{ ok: boolean; message: string; records: ScaleSaleRecord[] }>;
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

  /** Test/UI için sabit ağırlık ayarla */
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
      return {
        ok: !!r.ok,
        message: r.message || (r.ok ? 'Bağlantı başarılı' : 'Bağlantı başarısız'),
        displayText: r.displayText,
        weight: {
          connected: this.connected,
          weightKg: null,
          stable: false,
          detail: r.ok ? 'TCP test OK' : 'TCP test başarısız',
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
    // Rongta RLS etiket terazisi sürekli canlı ağırlık yaymaz; test + satış raporu kullanılır.
    return {
      connected: this.connected,
      weightKg: null,
      stable: false,
      detail: this.connected
        ? 'LAN Rongta: canlı kg yok — tartılı satışta simülasyon veya BT tartı kullanın'
        : 'Bağlı değil',
      source: 'network',
    };
  }

  async sendPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult> {
    return bridgeRongtaSendPlu(this.ipAddress, this.port, records);
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
}

/**
 * Bluetooth taşıma — gerçek GATT/SPP için `react-native-ble-plx` (+ opsiyonel classic BT)
 * ve Expo development build gerekir. Expo Go'da `isAvailable() === false`.
 */
export class BluetoothScaleTransport implements ScaleTransport, BluetoothScaleConnection {
  readonly kind = 'bluetooth' as const;
  readonly displayName: string;
  private connected = false;

  constructor(private readonly address: string) {
    this.displayName = `BT ${address || '(adres yok)'}`;
  }

  isAvailable(): boolean {
    // Native modül yüklü değil — açıkça false
    return false;
  }

  async connect(): Promise<ScaleConnectionResult> {
    return this.testConnection();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async testConnection(): Promise<ScaleConnectionResult> {
    this.connected = false;
    return {
      ok: false,
      message:
        'Bluetooth terazi Expo Go’da yok. Development build + react-native-ble-plx (veya classic SPP) ekleyin. Rongta etiket terazileri genelde TCP/LAN kullanır.',
      weight: {
        connected: false,
        weightKg: null,
        stable: false,
        detail: 'BT native modül yok',
        source: 'bluetooth',
      },
    };
  }

  async readLiveWeight(): Promise<LiveWeightReading> {
    return {
      connected: this.connected,
      weightKg: null,
      stable: false,
      detail: 'BT bağlantısı yok',
      source: 'bluetooth',
    };
  }

  async sendPlu(records: RongtaPluPayload[]): Promise<ScaleSyncResult> {
    return {
      success: false,
      message: 'Bluetooth PLU gönderimi henüz bağlanmadı (native modül gerekli)',
      productCount: records.length,
      sentCount: 0,
      failedCount: records.length,
      errors: ['BT native yok'],
    };
  }

  async fetchSales() {
    return {
      ok: false,
      message: 'BT satış okuma yok',
      records: [] as ScaleSaleRecord[],
    };
  }
}

const simulateSingleton = new SimulateScaleTransport();

export function getSimulateTransport(): SimulateScaleTransport {
  return simulateSingleton;
}

export function createScaleTransport(device: ScaleDevice): ScaleTransport {
  switch (device.transport) {
    case 'simulate':
      return getSimulateTransport();
    case 'bluetooth':
      return new BluetoothScaleTransport(device.bluetoothAddress ?? '');
    case 'network':
    default:
      return new NetworkScaleTransport(device.ipAddress, device.port);
  }
}

export function pluRecordsToPayload(rows: ScalePluRecord[]): RongtaPluPayload[] {
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
  }));
}

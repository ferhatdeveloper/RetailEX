/** RetailEX mobil terazi — Android TeraziManager + web ScaleManagement ile hizalı tipler */

export type ScaleTransportKind = 'network' | 'bluetooth' | 'simulate' | 'usb';

/** Bluetooth alt profili — BLE GATT veya Classic SPP */
export type BluetoothScaleProfile = 'ble' | 'spp';

export type ScaleDeviceStatus = 'unknown' | 'online' | 'offline' | 'error';

export type ScaleDevice = {
  id: string;
  name: string;
  /** TCP/LAN host */
  ipAddress: string;
  port: number;
  enabled: boolean;
  transport: ScaleTransportKind;
  /** BLE / Classic BT adres */
  bluetoothAddress?: string | null;
  bluetoothProfile?: BluetoothScaleProfile | null;
  /** USB cihaz kimliği (native) */
  usbDeviceId?: string | null;
  usbBaudRate?: number;
  brand: 'rongta' | 'generic';
  status: ScaleDeviceStatus;
  lastSync?: string | null;
  lastProductCount?: number;
  lastStatus?: string | null;
};

export type ScalePluRecord = {
  pluOrder: number;
  pluName: string;
  lfCode: number;
  code: string;
  barcodeType: number;
  unitPriceCents: number;
  weightUnit: number;
  department: number;
  shelfDays: number;
};

export type ScaleSaleRecord = {
  pluName: string;
  lfCode: number;
  weightKg: number;
  totalPrice: number;
  unitPrice: number;
  quantity: number;
  saleDate?: string | null;
};

export type LiveWeightReading = {
  connected: boolean;
  weightKg: number | null;
  stable: boolean;
  detail: string;
  /** simulate | network | bluetooth | usb */
  source: ScaleTransportKind;
};

export type ScaleSyncResult = {
  success: boolean;
  message: string;
  productCount: number;
  sentCount: number;
  failedCount: number;
  errors: string[];
};

export type ScaleConnectionResult = {
  ok: boolean;
  message: string;
  displayText?: string;
  weight?: LiveWeightReading;
};

/** Bluetooth bağlantı sözleşmesi — Expo Go’da native BT yok; development build. */
export type BluetoothScaleConnection = {
  readonly kind: 'bluetooth';
  isAvailable(): boolean;
  scan?(timeoutMs?: number): Promise<{ id: string; name: string }[]>;
  connect(): Promise<ScaleConnectionResult>;
  disconnect(): Promise<void>;
  readLiveWeight?(): Promise<LiveWeightReading>;
};

export const RONGTA_DEFAULT_PORT = 5001;
export const RONGTA_FALLBACK_PORTS = [5001, 20304, 4001, 9100] as const;

export const DEFAULT_SCALE_DEVICE = (): ScaleDevice => ({
  id: `scale-${Date.now().toString(36)}`,
  name: 'Terazi 1',
  ipAddress: '192.168.1.87',
  port: RONGTA_DEFAULT_PORT,
  enabled: true,
  transport: 'network',
  brand: 'rongta',
  status: 'unknown',
});

/**
 * Bluetooth ESC/POS yazıcı taşıyıcısı — iskelet.
 *
 * Hedef SDK: `react-native-bluetooth-escpos-printer` veya `react-native-thermal-receipt-printer`
 * (development build; Expo Go'da native modül yok — terazi BLE ile aynı kısıt).
 */

export type BluetoothEscposTransportKind = 'bluetooth-escpos' | 'unavailable';

export type BluetoothEscposSendResult = {
  ok: boolean;
  message: string;
  code?: BluetoothEscposErrorCode;
  transport?: BluetoothEscposTransportKind;
  bytesSent?: number;
};

export type BluetoothEscposErrorCode =
  | 'nativeUnavailable'
  | 'deviceNameRequired'
  | 'sdkNotWired'
  | 'sendFailed';

let nativeProbeDone = false;
let nativeAvailable = false;

/** Klasik Bluetooth SPP ESC/POS modülü yüklü mü? */
export function isBluetoothEscposAvailable(): boolean {
  if (!nativeProbeDone) probeBluetoothEscposNative();
  return nativeAvailable;
}

function probeBluetoothEscposNative(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-bluetooth-escpos-printer');
    nativeAvailable = true;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native-thermal-receipt-printer');
      nativeAvailable = true;
    } catch {
      nativeAvailable = false;
    }
  } finally {
    nativeProbeDone = true;
  }
}

export function bluetoothEscposDevBuildHint(): string {
  return (
    'Bluetooth ESC/POS Expo Go’da çalışmaz. Development build gerekir: ' +
    '`npx expo install react-native-bluetooth-escpos-printer` (veya thermal-receipt-printer) → ' +
    '`npx expo prebuild` → `npx expo run:android`. Şimdilik «Ağ (IP)» kullanın.'
  );
}

export function bluetoothEscposTransportStatus(): {
  available: boolean;
  hint: string;
} {
  return {
    available: isBluetoothEscposAvailable(),
    hint: isBluetoothEscposAvailable()
      ? 'Bluetooth ESC/POS modülü yüklü — bağlantı iskeleti hazır (SDK entegrasyonu Faz 2+).'
      : bluetoothEscposDevBuildHint(),
  };
}

/**
 * Ham ESC/POS baytını Bluetooth yazıcıya gönderir (iskelet).
 * SDK bağlandığında `BluetoothManager.connect` + `BluetoothEscposPrinter.printRawData` ile doldurulacak.
 */
export async function sendEscposOverBluetooth(
  deviceName: string,
  payload: Uint8Array,
): Promise<BluetoothEscposSendResult> {
  const trimmed = deviceName.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: 'deviceNameRequired',
      message: 'Bluetooth yazıcı adı girin.',
      transport: 'unavailable',
    };
  }

  if (!isBluetoothEscposAvailable()) {
    return {
      ok: false,
      code: 'nativeUnavailable',
      message: bluetoothEscposDevBuildHint(),
      transport: 'unavailable',
    };
  }

  // SDK modülü yüklü; gerçek SPP bağlantısı henüz bağlanmadı.
  void payload;
  return {
    ok: false,
    code: 'sdkNotWired',
    message: `Bluetooth ESC/POS iskeleti — «${trimmed}» için SDK gönderimi henüz tamamlanmadı. Ağ (IP) veya sistem yazıcısını deneyin.`,
    transport: 'bluetooth-escpos',
  };
}

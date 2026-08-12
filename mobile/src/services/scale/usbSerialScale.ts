/**
 * USB-OTG / seri (FTDI, CH340, CP210x, Prolific) — TeraziManager UsbSerialManager eşleniği.
 *
 * Expo Go: desteklenmez.
 * Development build: isteğe bağlı native (`react-native-usb-serialport` veya
 * `usb-serial-for-android` config plugin) — modül yoksa dürüst hata.
 */

export type UsbSerialDeviceInfo = {
  id: string;
  name: string;
  vendorId?: number;
  productId?: number;
  baudRate: number;
};

export const USB_DEFAULT_BAUD = 9600;

/** Bilinen chipset VID — TeraziManager usb_device_filter.xml */
export const USB_KNOWN_VIDS = [1027, 1659, 4292, 6790] as const;

let probeDone = false;
let nativeAvailable = false;

function tryLoadUsbSerial(): unknown | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-usb-serialport');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('react-native-serial-port');
    } catch {
      return null;
    }
  }
}

export function isUsbSerialNativeAvailable(): boolean {
  if (!probeDone) {
    nativeAvailable = tryLoadUsbSerial() !== null;
    probeDone = true;
  }
  return nativeAvailable;
}

export function usbSerialDevBuildHint(): string {
  return (
    'USB-OTG seri (RS232) Expo Go’da çalışmaz. Development build + ' +
    '`react-native-usb-serialport` (veya eşdeğer) + Android USB host izni gerekir. ' +
    'TeraziManager native: usb-serial-for-android 9600 8N1. Şimdilik TCP/LAN kullanın.'
  );
}

export function usbSerialTransportStatus(): { available: boolean; hint: string } {
  const available = isUsbSerialNativeAvailable();
  return {
    available,
    hint: available
      ? 'USB seri native modül yüklü — cihaz listesi/bağlantı bağlanıyor.'
      : usbSerialDevBuildHint(),
  };
}

/**
 * USB cihaz listesi. Native yoksa boş + hint.
 * Native SDK bağlandığında listDevices çağrısı burada doldurulur.
 */
export async function listUsbSerialDevices(
  baudRate = USB_DEFAULT_BAUD,
): Promise<{ devices: UsbSerialDeviceInfo[]; message: string }> {
  if (!isUsbSerialNativeAvailable()) {
    return { devices: [], message: usbSerialDevBuildHint() };
  }
  // Modül mevcut ancak PLU/Rt2 köprüsü henüz bağlanmadı — yanlış “başarı” dönmüyoruz.
  void baudRate;
  return {
    devices: [],
    message:
      'USB native tespit edildi; Rongta Rt2Protocol / SerialOverUsbClient köprüsü ' +
      'development build config plugin ile tamamlanmalı. VID filtresi: FTDI/CH340/CP210x/Prolific.',
  };
}

export async function usbSerialClearPlu(_deviceId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isUsbSerialNativeAvailable()) {
    return { ok: false, message: usbSerialDevBuildHint() };
  }
  return {
    ok: false,
    message:
      'USB clearPlu: Android TeraziManager Rt2Protocol.clearPludata gerekir — RN native köprü bekleniyor.',
  };
}

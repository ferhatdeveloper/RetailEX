/** Web `retailos-printer-settings` ile uyumlu alan adları (mobil AsyncStorage). */
export type PrinterInterface = 'bluetooth' | 'network' | 'system';
export type PrinterType = 'thermal' | 'standard';
export type ReceiptPaperSize = '58mm' | '80mm' | 'A4' | 'A5';
export type ReceiptLangCode = 'tr' | 'en' | 'ar' | 'ku' | 'uz';

export type MobilePrinterSettings = {
  enabled: boolean;
  type: PrinterType;
  interface: PrinterInterface;
  /** Bluetooth cihaz adı (mobil) */
  bluetoothDeviceName?: string;
  /** Ağ termal yazıcı */
  ipAddress?: string;
  port?: number;
  /** Kağıt genişliği — web `paperSize` ile aynı anahtar */
  paperSize: ReceiptPaperSize;
  autoPrint: boolean;
  defaultLanguage: ReceiptLangCode;
  /** Masaüstü uyumu — mobilde yalnızca bilgi amaçlı saklanır */
  windowsPrinterName?: string;
  /** Fiş üst bilgi (yerel yedek; PG `receipt_settings` yoksa kullanılır) */
  companyName?: string;
  companyPhone?: string;
};

export const DEFAULT_PRINTER_SETTINGS: MobilePrinterSettings = {
  enabled: true,
  type: 'thermal',
  interface: 'network',
  ipAddress: '192.168.1.100',
  port: 9100,
  paperSize: '80mm',
  autoPrint: false,
  defaultLanguage: 'tr',
};

export type PrinterTransportKind =
  | 'bridge'
  | 'native-tcp'
  | 'bluetooth-escpos'
  | 'system-print'
  | 'unavailable';

export type PrinterErrorCode =
  | 'disabled'
  | 'ipRequired'
  | 'invalidPort'
  | 'btNameRequired'
  | 'btNativeUnavailable'
  | 'btSdkNotWired'
  | 'systemPrintUnavailable'
  | 'systemPrintFailed'
  | 'systemPrintCancelled'
  | 'autoPrintOff';

export type TestPrintResult = {
  ok: boolean;
  message: string;
  /** i18n anahtarı — ekran `printerSettings.errors.{code}` ile çevirir */
  code?: PrinterErrorCode;
  /** Metin önizleme (test / hata durumunda) */
  preview?: string;
  transport?: PrinterTransportKind;
  bytesSent?: number;
};

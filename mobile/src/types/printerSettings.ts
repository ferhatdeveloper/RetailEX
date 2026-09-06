/** Web `retailos-printer-settings` ile uyumlu alan adları (mobil AsyncStorage). */
export type PrinterInterface = 'bluetooth' | 'network' | 'system' | 'windows-service';
export type PrinterType = 'thermal' | 'standard';
export type ReceiptPaperSize = '58mm' | '80mm' | 'A4' | 'A5';
export type ReceiptLangCode = 'tr' | 'en' | 'ar' | 'ku' | 'uz';

/**
 * RN mobilde yöneticinin tek noktadan açıp kapatabileceği
 * «Windows yazıcı servisi genel geçişi». Bu açık olduğunda
 * aşağıdaki `*WindowsService` flag'leri true olan fiş türleri
 * otomatik olarak Windows servisine yönlendirilir — kullanıcı
 * PrinterSettings'deki «bağlantı tipi» seçimine bağlı kalmaz.
 */
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
  /** Windows print service adresi (örn. http://192.168.1.50:9105) */
  windowsServiceUrl?: string;
  /** Windows print service API anahtarı (opsiyonel Bearer token) */
  windowsServiceApiKey?: string;
  /** Masaüstü uyumu — mobilde yalnızca bilgi amaçlı saklanır */
  windowsPrinterName?: string;
  /** Fiş üst bilgi (yerel yedek; PG `receipt_settings` yoksa kullanılır) */
  companyName?: string;
  companyPhone?: string;

  /**
   * YÖNETİM — Windows yazıcı servisi genel geçişi (admin-only).
   * AÇIK olduğunda aşağıdaki `*WindowsService` flag'leri true olan
   * fiş türleri PrinterSettings ekranındaki bağlantı tipi ne olursa
   * olsun Windows servisine yönlendirilir.
   *
   * Default false — mevcut cihaz yazıcı davranışını bozmaz.
   */
  useWindowsServiceGlobal?: boolean;
  /** Mutfak fişleri (restaurant kitchen tickets) → Windows servisi */
  kitchenTicketWindowsService?: boolean;
  /** POS / perakende satış fişleri → Windows servisi */
  posReceiptWindowsService?: boolean;
  /** Adisyon / hesap özeti fişleri → Windows servisi */
  accountReceiptWindowsService?: boolean;
  /** A4/A5 fatura yazdırma → Windows servisi */
  invoiceWindowsService?: boolean;
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
  // Yönetim — Windows yazıcı servisi varsayılan KAPALI (mevcut
  // cihaz yazıcı davranışı bozulmasın).
  useWindowsServiceGlobal: false,
  kitchenTicketWindowsService: false,
  posReceiptWindowsService: false,
  accountReceiptWindowsService: false,
  invoiceWindowsService: false,
};

export type PrinterTransportKind =
  | 'bridge'
  | 'native-tcp'
  | 'bluetooth-escpos'
  | 'system-print'
  | 'windows-service'
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
  | 'autoPrintOff'
  | 'windowsUnreachable'
  | 'windowsPrinterNotFound'
  | 'windowsUnauthorized'
  | 'windowsServiceError'
  | 'windowsTimeout'
  | 'windowsInvalidUrl';

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

/**
 * RN mobilde «Windows yazıcı servisi genel geçişi» açıkken
 * belirli bir fiş türü için gerçek kullanılacak interface'i döndürür.
 *
 * - useWindowsServiceGlobal === false → mevcut davranış (settings.interface)
 * - useWindowsServiceGlobal === true ve `kind` için ilgili flag true
 *   → 'windows-service' (settings.interface ne olursa olsun)
 * - aksi → mevcut davranış
 */
export type PrintJobKind =
  | 'kitchen_ticket'
  | 'pos_receipt'
  | 'account_receipt'
  | 'invoice';

export function resolveEffectiveInterface(
  settings: Pick<
    MobilePrinterSettings,
    | 'interface'
    | 'useWindowsServiceGlobal'
    | 'kitchenTicketWindowsService'
    | 'posReceiptWindowsService'
    | 'accountReceiptWindowsService'
    | 'invoiceWindowsService'
  >,
  kind: PrintJobKind,
): PrinterInterface {
  if (settings.useWindowsServiceGlobal === true) {
    switch (kind) {
      case 'kitchen_ticket':
        if (settings.kitchenTicketWindowsService === true) return 'windows-service';
        break;
      case 'pos_receipt':
        if (settings.posReceiptWindowsService === true) return 'windows-service';
        break;
      case 'account_receipt':
        if (settings.accountReceiptWindowsService === true) return 'windows-service';
        break;
      case 'invoice':
        if (settings.invoiceWindowsService === true) return 'windows-service';
        break;
    }
  }
  return settings.interface;
}

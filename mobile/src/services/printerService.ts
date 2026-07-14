import type { MobilePrinterSettings, TestPrintResult } from '../types/printerSettings';
import { buildSaleReceiptEscPos, buildTestReceiptEscPos } from './escpos/buildReceiptEscPos';
import { escposTransportStatus, sendEscposOverNetwork } from './escpos/escposTcpTransport';

function buildTestReceiptPreview(settings: MobilePrinterSettings): string {
  const now = new Date().toLocaleString('tr-TR');
  const company = settings.companyName?.trim() || 'RetailEX';
  const transport = escposTransportStatus();
  const lines = [
    '================================',
    `       ${company}`,
    settings.companyPhone ? `Tel: ${settings.companyPhone}` : null,
    '--------------------------------',
    'TEST FİŞİ',
    `Tarih: ${now}`,
    `Kağıt: ${settings.paperSize}`,
    `Bağlantı: ${settings.interface}`,
    settings.interface === 'network'
      ? `Hedef: ${settings.ipAddress || '—'}:${settings.port ?? 9100}`
      : settings.interface === 'bluetooth'
        ? `BT: ${settings.bluetoothDeviceName || '—'}`
        : 'Sistem varsayılanı',
    '--------------------------------',
    'Ürün A          1 x 10,00  10,00',
    'Ürün B          2 x  5,50  11,00',
    '--------------------------------',
    'TOPLAM                  21,00 TL',
    '================================',
    '        Teşekkürler',
    settings.interface === 'network'
      ? `Taşıyıcı: köprü${transport.nativeTcp ? ' / doğrudan TCP' : ''}`
      : null,
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

function validatePrinterSettings(settings: MobilePrinterSettings): TestPrintResult | null {
  if (!settings.enabled) {
    return { ok: false, message: 'Yazıcı devre dışı. Önce «Yazıcı aktif» seçeneğini açın.' };
  }

  if (settings.interface === 'network') {
    const ip = settings.ipAddress?.trim();
    if (!ip) {
      return { ok: false, message: 'Ağ yazıcısı için IP adresi girin.' };
    }
    const port = settings.port ?? 9100;
    if (port < 1 || port > 65535) {
      return { ok: false, message: 'Geçersiz port numarası (1–65535).' };
    }
  }

  if (settings.interface === 'bluetooth' && !settings.bluetoothDeviceName?.trim()) {
    return {
      ok: false,
      message: 'Bluetooth yazıcı adı girin veya «Sistem» bağlantı tipini seçin.',
    };
  }

  return null;
}

async function printNetworkEscPos(
  settings: MobilePrinterSettings,
  payload: Uint8Array,
): Promise<TestPrintResult> {
  const ip = settings.ipAddress!.trim();
  const port = settings.port ?? 9100;
  const res = await sendEscposOverNetwork(ip, port, payload);
  const transportLabel =
    res.transport === 'bridge'
      ? 'köprü'
      : res.transport === 'native-tcp'
        ? 'doğrudan TCP'
        : undefined;

  return {
    ok: res.ok,
    message: res.ok
      ? `${res.message}${transportLabel ? ` (${transportLabel})` : ''}`
      : res.message,
    transport: res.transport,
    bytesSent: res.bytesSent,
  };
}

/**
 * Test yazdırma.
 * - Ağ (IP): ESC/POS TCP — pg_bridge veya (dev build) react-native-tcp-socket
 * - Bluetooth / Sistem: henüz stub (Faz 2+)
 */
export async function testPrintReceipt(
  settings: MobilePrinterSettings,
): Promise<TestPrintResult> {
  const validation = validatePrinterSettings(settings);
  if (validation) return validation;

  const preview = buildTestReceiptPreview(settings);

  if (settings.interface === 'network') {
    const payload = buildTestReceiptEscPos(settings);
    const res = await printNetworkEscPos(settings, payload);
    return { ...res, preview };
  }

  if (settings.interface === 'bluetooth') {
    return {
      ok: false,
      message:
        'Bluetooth ESC/POS henüz bağlı değil. SDK yolu: `react-native-bluetooth-escpos-printer` veya `react-native-thermal-receipt-printer` (development build). Şimdilik «Ağ (IP)» kullanın.',
      preview,
      transport: 'unavailable',
    };
  }

  return {
    ok: false,
    message:
      'Sistem yazıcısı (paylaşım menüsü) henüz bağlı değil. SDK yolu: `expo-print` + `expo-sharing` veya platform Print API. Şimdilik «Ağ (IP)» kullanın.',
    preview,
    transport: 'unavailable',
  };
}

/** POS fiş kaydı sonrası otomatik yazdırma. */
export async function printSaleReceipt(
  settings: MobilePrinterSettings,
  saleId: string,
): Promise<TestPrintResult> {
  if (!settings.enabled || !settings.autoPrint) {
    return { ok: false, message: 'Otomatik yazdırma kapalı.' };
  }

  if (settings.interface === 'network') {
    const validation = validatePrinterSettings(settings);
    if (validation) return validation;
    const payload = buildSaleReceiptEscPos(settings, saleId, [], 0);
    return printNetworkEscPos(settings, payload);
  }

  return testPrintReceipt(settings);
}

/** @deprecated printSaleReceipt kullanın */
export const printSaleReceiptStub = printSaleReceipt;

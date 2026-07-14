import type { MobilePrinterSettings, TestPrintResult } from '../types/printerSettings';

const STUB_DELAY_MS = 700;

function buildTestReceiptPreview(settings: MobilePrinterSettings): string {
  const now = new Date().toLocaleString('tr-TR');
  const company = settings.companyName?.trim() || 'RetailEX';
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
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

/**
 * Test yazdırma — şimdilik stub (gerçek BT/ağ yazıcı entegrasyonu Faz 2+).
 * Başarılı stub, ileride `expo-print` / native modül ile değiştirilebilir.
 */
export async function testPrintReceipt(
  settings: MobilePrinterSettings,
): Promise<TestPrintResult> {
  await new Promise((r) => setTimeout(r, STUB_DELAY_MS));

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

  const preview = buildTestReceiptPreview(settings);

  return {
    ok: true,
    message:
      settings.interface === 'network'
        ? `Test fişi simüle edildi → ${settings.ipAddress}:${settings.port ?? 9100} (gerçek yazdırma henüz bağlı değil).`
        : 'Test fişi simüle edildi (mobil stub — gerçek donanım Faz 2+).',
    preview,
  };
}

/** POS fiş kaydı sonrası otomatik yazdırma kontrolü (stub). */
export async function printSaleReceiptStub(
  settings: MobilePrinterSettings,
  _saleId: string,
): Promise<TestPrintResult> {
  if (!settings.enabled || !settings.autoPrint) {
    return { ok: false, message: 'Otomatik yazdırma kapalı.' };
  }
  return testPrintReceipt(settings);
}

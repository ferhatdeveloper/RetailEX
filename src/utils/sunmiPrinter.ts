import { registerPlugin } from '@capacitor/core';

export interface SunmiPrinterPlugin {
  printerInit(): Promise<void>;
  printText(options: { text: string }): Promise<void>;
  printTextWithFont(options: { text: string; fontSize?: number }): Promise<void>;
  printColumnsText(options: { texts: string[]; widths: number[]; aligns: number[] }): Promise<void>;
  lineWrap(options: { lines: number }): Promise<void>;
  getPrinterStatus(): Promise<{ status: number }>;
  printQRCode(options: { data: string; moduleSize?: number; errorLevel?: number }): Promise<void>;
}

const SunmiPrinter = registerPlugin<SunmiPrinterPlugin>('SunmiPrinter');

export default SunmiPrinter;

/**
 * Sunmi Yazıcı Yardımcı Fonksiyonları
 */
export const SunmiUtils = {
  /**
   * Fiş başlığı yazdırır
   */
  async printHeader(companyName: string) {
    await SunmiPrinter.printerInit();
    await SunmiPrinter.printTextWithFont({ text: companyName + '\n', fontSize: 32 });
    await SunmiPrinter.lineWrap({ lines: 1 });
  },

  /**
   * Ayırıcı çizgi yazdırır (58mm için yaklaşık 32-38 karakter)
   */
  async printDivider() {
    await SunmiPrinter.printText({ text: '--------------------------------\n' });
  },

  /**
   * Çift ayırıcı çizgi yazdırır
   */
  async printDoubleDivider() {
    await SunmiPrinter.printText({ text: '================================\n' });
  },

  /**
   * İki sütunlu metin yazdırır (Sol-Sağ hizalı)
   */
  async printLabelValue(label: string, value: string) {
    await SunmiPrinter.printColumnsText({
      texts: [label, value],
      widths: [16, 16],
      aligns: [0, 2] // 0: Left, 1: Center, 2: Right
    });
  },

  /**
   * Ürün satırı yazdırır
   */
  async printItemRow(name: string, qty: string, price: string) {
    await SunmiPrinter.printColumnsText({
      texts: [name, qty, price],
      widths: [18, 4, 10],
      aligns: [0, 1, 2]
    });
  }
};

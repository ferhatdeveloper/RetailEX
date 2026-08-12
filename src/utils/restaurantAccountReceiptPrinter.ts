import { useRestaurantStore } from '../components/restaurant/store/useRestaurantStore';
import { getStoredWindowsPrinterNameForPrint } from './tauriPrintSettings';

/**
 * Hesap / kasa 80mm fişi (adisyon, ön hesap, Receipt80mm):
 * önce Restoran «Ortak Yazıcı» profili sistem yazıcısı ise onu kullanır;
 * yoksa Yazıcı Ayarları (localStorage `retailos-printer-settings`);
 * ikisi de yoksa Tauri tarafında OS varsayılanı.
 *
 * Kategori bazlı mutfak yönlendirmesi burada kullanılmaz.
 */
export function getAccountReceiptSystemPrinterName(): string | null {
  try {
    const { commonPrinterId, printerProfiles } = useRestaurantStore.getState();
    if (commonPrinterId) {
      const p = printerProfiles.find((x) => x.id === commonPrinterId);
      if (p?.connection === 'system' && p.systemName?.trim()) {
        return p.systemName.trim();
      }
    }
  } catch {
    /* store henüz yok veya test ortamı */
  }
  return getStoredWindowsPrinterNameForPrint();
}

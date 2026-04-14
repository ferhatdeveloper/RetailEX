/**
 * Cari hesaplar — Excel modülü (içe aktarım) ile aynı sütun başlıkları.
 * @see ExcelModule importCurrentAccounts
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import * as XLSX from 'xlsx';
import type { Supplier } from '../core/types/models';

export function mapUnifiedSupplierToCurrentAccountExcelRow(s: Supplier): Record<string, string | number> {
  const isCustomer = s.cardType === 'customer';
  return {
    'Hesap Kodu*': s.code || '',
    'Ünvan*': s.name,
    'Tip (MÜŞTERİ/TEDARİKÇİ)': isCustomer ? 'MÜŞTERİ' : 'TEDARİKÇİ',
    'Telefon': s.phone || '',
    'E-posta': s.email || '',
    'Adres': s.address || '',
    'İlçe': s.district || '',
    'Şehir': s.city || '',
    'Posta Kodu': s.postal_code || '',
    'Ülke': s.country || '',
    'Vergi No': s.tax_number || s.taxNumber || '',
    'Vergi Dairesi': s.tax_office || s.taxOffice || '',
    'Kredi Limiti': s.credit_limit ?? 0,
    'Vade Süresi (Gün)': s.payment_terms ?? 30,
    'Ödeme Şekli': '',
    'İskonto Oranı (%)': 0,
    'Notlar': s.notes || '',
    'Aktif (E/H)': s.is_active !== false ? 'E' : 'H',
  };
}

const SHEET_NAME = 'Cari Hesaplar';

/**
 * Tek sayfa .xlsx kaydeder (Tauri dosya diyaloğu).
 * @returns Dosya yazıldıysa true; kullanıcı iptal ettiyse false.
 */
export async function saveCurrentAccountsAsXlsx(
  rows: Record<string, string | number>[],
  fileName?: string
): Promise<boolean> {
  if (rows.length === 0) return false;

  const name = fileName ?? `CariHesaplar_${new Date().toISOString().split('T')[0]}.xlsx`;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  const maxWidth = 30;
  const cols = Object.keys(rows[0]).map(k => ({ wch: Math.min(Math.max(k.length + 2, 12), maxWidth) }));
  ws['!cols'] = cols;
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  const buf: Uint8Array = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  const savePath = await save({
    defaultPath: name,
    filters: [{ name: 'Excel Dosyası', extensions: ['xlsx'] }],
  });
  if (!savePath) return false;

  await writeFile(savePath, buf);
  return true;
}

import type { Sale, SaleItem } from '../core/types';

/** Güzellik / klinik satış fişi mi? (market POS’tan ayırır) */
export function isBeautyReceiptSale(sale: Sale): boolean {
  const items = sale.items || [];
  if (items.some((i) => !!(i as SaleItem).beautyStaffName?.trim())) return true;
  const s = sale as Sale & {
    beautyDeviceName?: string;
    beautyTreatmentDegree?: string;
    beautyTreatmentShots?: string;
  };
  if (String(s.beautyDeviceName ?? '').trim()) return true;
  if (String(s.beautyTreatmentDegree ?? '').trim()) return true;
  if (String(s.beautyTreatmentShots ?? '').trim()) return true;
  const rn = String(sale.receiptNumber ?? '');
  return rn.startsWith('BTY-') || rn.startsWith('BEA-');
}

/** Satır personelleri (sıra korunur, tekrarsız) */
export function beautyReceiptStaffNames(sale: Sale): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of sale.items || []) {
    const n = String((item as SaleItem).beautyStaffName ?? '').trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  if (out.length === 0) {
    const cashier = String(sale.cashier ?? '').trim();
    if (cashier && cashier !== '—') out.push(cashier);
  }
  return out;
}

/**
 * Satış Detayları ızgarası — Tür kolonu etiketi.
 *
 * Ürün satışı "Ürün", hizmet satışı "Hizmet" kalır.
 * İade fişi (durum return/refunded veya eksi tutar) "İade" yazar.
 * Tutar, indirim öncesi ve net bu fonksiyonda değişmez.
 */

export interface DailySalesDetailKindInput {
  isAvans?: boolean;
  isDeposit?: boolean;
  kind?: string | null;
  status?: string | null;
  total?: number | null;
  beforeDiscount?: number | null;
}

export interface DailySalesDetailKindLabels {
  service: string;
  product: string;
  mixed: string;
  all: string;
  reservation: string;
  return: string;
}

const RAW_KEY = /^reportsDailyKind/i;

function labelText(value: string | undefined, fallback: string): string {
  const text = String(value ?? '').trim();
  if (!text || RAW_KEY.test(text)) return fallback;
  return text;
}

/** İade fişi: durum veya eksi tutar. Avans ve depozito iade değildir. */
export function isDailySalesDetailReturn(row: DailySalesDetailKindInput): boolean {
  if (row.isAvans === true || row.isDeposit === true) return false;
  const status = String(row.status ?? '').trim().toLowerCase();
  if (status === 'return' || status === 'refunded') return true;
  const total = Number(row.total);
  if (Number.isFinite(total) && total < -1e-9) return true;
  const before = Number(row.beforeDiscount);
  return Number.isFinite(before) && before < -1e-9;
}

/** Tür rozeti. Yalnız metin; satır tutarlarına dokunmaz. */
export function dailySalesDetailKindLabel(
  row: DailySalesDetailKindInput,
  labels: DailySalesDetailKindLabels,
): string {
  if (row.isAvans === true) return labelText(labels.reservation, 'Rezervasyon');
  if (isDailySalesDetailReturn(row)) return labelText(labels.return, 'İade');
  if (row.kind === 'service') return labelText(labels.service, 'Hizmet');
  if (row.kind === 'product') return labelText(labels.product, 'Ürün');
  if (row.kind === 'mixed') return labelText(labels.mixed, 'Karma');
  return labelText(labels.all, 'Tümü');
}

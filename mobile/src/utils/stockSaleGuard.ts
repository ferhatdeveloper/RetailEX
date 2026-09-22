/**
 * Mobil POS — negatif stok satış engeli (web `stockSaleGuard` ile aynı kural).
 * Parametre: system_settings.report_menu_params.block-negative-stock-sale
 * (varsayılan kapalı = satılabilir; açık = engel).
 */
import { pgQuery } from '../api/pgClient';

export type MobileStockDemandLine = {
  productId: string;
  name?: string;
  quantity: number;
  availableStock: number;
  materialType?: string | null;
  isService?: boolean;
};

let cachedBlockFlag: { value: boolean; at: number } | null = null;
const CACHE_MS = 60_000;

export async function isBlockNegativeStockSaleEnabledMobile(): Promise<boolean> {
  const now = Date.now();
  if (cachedBlockFlag && now - cachedBlockFlag.at < CACHE_MS) {
    return cachedBlockFlag.value;
  }
  try {
    const { rows } = await pgQuery<{ report_menu_params?: unknown }>(
      `SELECT report_menu_params FROM public.system_settings WHERE id = 1 LIMIT 1`,
      [],
    );
    const raw = rows[0]?.report_menu_params;
    const params =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : raw && typeof raw === 'object'
          ? (raw as Record<string, unknown>)
          : null;
    // Yalnızca açıkça true ise engelle; yok/false → satılabilir (web ile aynı)
    const enabled = params?.['block-negative-stock-sale'] === true;
    cachedBlockFlag = { value: enabled, at: now };
    return enabled;
  } catch {
    cachedBlockFlag = { value: false, at: now };
    return false;
  }
}

export function isStockExemptMobile(line: Pick<MobileStockDemandLine, 'isService' | 'materialType'>): boolean {
  if (line.isService === true) return true;
  const mt = String(line.materialType || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return mt === 'service' || mt === 'hizmet';
}

export function findInsufficientStockHitsMobile(lines: MobileStockDemandLine[]): MobileStockDemandLine[] {
  const byId = new Map<string, MobileStockDemandLine>();
  for (const line of lines) {
    const id = String(line.productId || '').trim();
    if (!id || isStockExemptMobile(line)) continue;
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const prev = byId.get(id);
    if (prev) {
      prev.quantity += qty;
    } else {
      byId.set(id, { ...line, quantity: qty });
    }
  }
  const hits: MobileStockDemandLine[] = [];
  for (const row of byId.values()) {
    const avail = Number(row.availableStock) || 0;
    if (avail - row.quantity < 0) hits.push(row);
  }
  return hits;
}

export function formatInsufficientStockMessageMobile(hits: MobileStockDemandLine[]): string {
  if (!hits.length) return '';
  const first = hits[0]!;
  const head =
    (Number(first.availableStock) || 0) <= 0
      ? 'Stokta ürün yok'
      : 'Negatif seviye kayıt yapılamaz';
  const detail = hits
    .slice(0, 5)
    .map((h) => {
      const avail = Number(h.availableStock) || 0;
      const name = h.name || h.productId;
      if (avail <= 0) return `• ${name}: stokta yok`;
      return `• ${name}: mevcut ${avail}, talep ${h.quantity}`;
    })
    .join('\n');
  return `${head}\n${detail}`;
}

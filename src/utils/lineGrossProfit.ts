/**
 * Satır brüt kârı (Kar Brt) — ortak muhasebe formülü.
 *
 * Brüt kâr = ciro − COGS
 * COGS     = birim maliyet × miktar
 *
 * Satış:        kâr = ciro − (maliyet × qty)
 * Satış iadesi: ciro ve COGS işaretli geri alınır → kâr = −(|ciro| − maliyet×|qty|)
 *
 * Birim maliyet kaynağı çağıranda çözülür (ağırlıklı ort. / son alış / satır unit_cost).
 * unit_cost=0 iken kaydedilmiş gross_profit çoğu zaman ciroya eşittir — güvenilmez.
 */

export type LineGrossProfitKind = 'sales' | 'sales_return' | 'purchase' | 'purchase_return' | 'other';

const EPS = 0.0000001;
const MONEY_EPS = 0.02;

export function isPurchaseGrossProfitKind(kind: LineGrossProfitKind | string | null | undefined): boolean {
  const k = String(kind || '');
  return k === 'purchase' || k === 'purchase_return';
}

export function isSalesGrossProfitKind(kind: LineGrossProfitKind | string | null | undefined): boolean {
  const k = String(kind || '');
  return k === 'sales' || k === 'sales_return';
}

/**
 * Kayıtlı gross_profit güvenilir mi?
 * - |stored| ≈ |ciro| ise maliyet düşülmemiş demektir (güvenilmez)
 * - Birim maliyet yoksa: ciroya eşit değilse kaydı koru (yeniden hesaplanamaz ama
 *   doğru kaydedilmiş 3k gibi değerler kaybolmasın)
 */
export function isUntrustedStoredGrossProfit(
  stored: number,
  revenue: number,
  unitCost: number,
): boolean {
  const s = Number(stored) || 0;
  const rev = Number(revenue) || 0;
  if (!(Math.abs(s) > EPS)) return true;
  // Ciroyu kâr diye yazmış → her zaman güvenilmez
  if (Math.abs(rev) > MONEY_EPS && Math.abs(Math.abs(s) - Math.abs(rev)) <= MONEY_EPS) {
    return true;
  }
  // unitCost: yeniden hesap için çağıran kullanır; burada yalnızca imza uyumu
  void unitCost;
  // stored ≠ ciro → kaydı kullan (maliyet yoksa bile kısmi doğru 3k korunur)
  return false;
}

/**
 * qty≈0 ama tutar/fiyat varsa miktarı ciro/birim fiyattan tahmin et
 * (hatalı qty=0 iade satırları için).
 */
export function inferQtyFromRevenue(
  quantity: number,
  revenue: number,
  unitPrice: number,
): number {
  const qty = Math.abs(Number(quantity) || 0);
  if (qty > EPS) return qty;
  const rev = Math.abs(Number(revenue) || 0);
  const price = Math.abs(Number(unitPrice) || 0);
  if (rev > MONEY_EPS && price > EPS) return rev / price;
  return 0;
}

/**
 * İşaretli COGS: satış +, satış iadesi − (miktar geri alınır).
 */
export function signedCogsAmount(opts: {
  quantity: number;
  unitCost: number;
  isSalesReturn?: boolean;
}): number {
  const qtyAbs = Math.abs(Number(opts.quantity) || 0);
  const unit = Number(opts.unitCost) || 0;
  if (!(qtyAbs > EPS) || !(unit > EPS)) return 0;
  const signedQty = opts.isSalesReturn ? -qtyAbs : qtyAbs;
  return unit * signedQty;
}

/**
 * Brüt kâr = işaretli ciro − işaretli COGS.
 * Alış / alış iadesinde null (ekranda —).
 * Birim maliyet yoksa null (ciroyu kâr yazma).
 */
export function computeLineGrossProfit(opts: {
  kind: LineGrossProfitKind | string;
  /** Satır cirosu (pozitif tutar; iade işaretini isSalesReturn/kind verir) */
  revenue: number;
  quantity: number;
  unitCost: number;
  unitPrice?: number;
}): number | null {
  const kind = String(opts.kind || 'other') as LineGrossProfitKind;
  if (isPurchaseGrossProfitKind(kind)) return null;

  const isReturn = kind === 'sales_return';
  if (kind !== 'sales' && kind !== 'sales_return' && kind !== 'other') return null;

  const unitCost = Number(opts.unitCost) || 0;
  if (!(unitCost > EPS)) return null;

  const revenueAbs = Math.abs(Number(opts.revenue) || 0);
  const qtyAbs = inferQtyFromRevenue(opts.quantity, revenueAbs, Number(opts.unitPrice) || 0);
  if (!(qtyAbs > EPS) && !(revenueAbs > MONEY_EPS)) return null;

  // qty=0 fiyat farkı iadesi: yalnızca ciro etkisi (COGS yok)
  const signedRev = isReturn ? -revenueAbs : revenueAbs;
  const cogs = signedCogsAmount({ quantity: qtyAbs, unitCost, isSalesReturn: isReturn });
  const profit = signedRev - cogs;
  return Math.abs(profit) > EPS ? profit : 0;
}

/**
 * Hareket geçmişi / API: stored varsa ve güvenilirse kullan; değilse yeniden hesapla.
 */
export function resolveLineGrossProfit(opts: {
  kind: LineGrossProfitKind | string;
  storedGrossProfit?: number | null;
  revenue: number;
  quantity: number;
  unitCost: number;
  unitPrice?: number;
}): number | null {
  if (isPurchaseGrossProfitKind(opts.kind)) return null;

  const unitCost = Number(opts.unitCost) || 0;
  const stored = Number(opts.storedGrossProfit ?? 0) || 0;
  const revenueAbs = Math.abs(Number(opts.revenue) || 0);

  if (
    Math.abs(stored) > EPS &&
    !isUntrustedStoredGrossProfit(stored, revenueAbs, unitCost)
  ) {
    const isReturn = String(opts.kind) === 'sales_return';
    // DB bazen iadeyi pozitif yazar
    if (isReturn && stored > 0) return -Math.abs(stored);
    return stored;
  }

  return computeLineGrossProfit({
    kind: opts.kind,
    revenue: revenueAbs,
    quantity: opts.quantity,
    unitCost,
    unitPrice: opts.unitPrice,
  });
}

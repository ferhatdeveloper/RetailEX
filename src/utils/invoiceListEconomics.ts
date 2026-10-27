/**
 * Fatura listesi maliyet / kâr / marj.
 *
 * Net: `invoiceListPayableNet` (dip indirim bir kez).
 * Ürün maliyeti kayıtlı stok maliyetidir; değiştirilmez.
 * Hizmet satırında kart alış/maliyet × miktar. Kartta maliyet yoksa 0.
 * Satış kârı = net − maliyet. Marj = kâr / net (listeyle aynı oran).
 * Kasa satırı ve fiş formunun satır brütü bu hesaba yazılmaz.
 */
import { isServiceInvoiceLineType } from './invoiceLineMix';
import {
  invoiceListPayableNet,
  type InvoiceListPayableSource,
} from './invoiceListPayableNet';

export type InvoiceListServiceLine = {
  itemType?: string;
  quantity?: number;
  /** Hizmet kartı birim alış / maliyet. Yoksa 0. Satış fiyatı değildir. */
  cardUnitCost?: number;
};

export type InvoiceListEconomicsSource = InvoiceListPayableSource & {
  invoice_category?: string | null;
  line_mix?: string | null;
  total_cost?: unknown;
  gross_profit?: unknown;
  profit_margin?: unknown;
  service_lines?: ReadonlyArray<InvoiceListServiceLine> | null;
};

function finite(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function keepsStoredProfit(category: string): boolean {
  return category === 'Alis' || category === 'Iade';
}

/** Kart birim maliyeti: ERP alış, yoksa güzellik maliyet. Satış fiyatı kullanılmaz. */
export function serviceCardUnitCost(source: {
  purchasePrice?: unknown;
  beautyCostPrice?: unknown;
}): number {
  const purchase = finite(source.purchasePrice);
  if (purchase != null && purchase > 0) return purchase;
  const beauty = finite(source.beautyCostPrice);
  if (beauty != null && beauty > 0) return beauty;
  return 0;
}

/** Hizmet satırı: birim maliyet × miktar. Ürün satırı 0 (stok maliyeti buradan gelmez). */
export function serviceLineCardCost(line: InvoiceListServiceLine): number {
  if (!isServiceInvoiceLineType(line.itemType)) return 0;
  const qty = Math.abs(finite(line.quantity) ?? 0);
  const unit = finite(line.cardUnitCost) ?? 0;
  if (!(qty > 0) || !(unit > 0)) return 0;
  return roundMoney(qty * unit);
}

/**
 * Liste maliyet hücresi.
 * Ürün / karma: kayıtlı maliyet.
 * Hizmet: kart tutarı > 0 ise o, yoksa kayıtlı (genelde 0).
 */
export function invoiceListDisplayedCost(inv: InvoiceListEconomicsSource): number {
  const stored = finite(inv.total_cost) ?? 0;
  if (inv.line_mix !== 'service') return roundMoney(stored);
  let card = 0;
  for (const line of inv.service_lines || []) card += serviceLineCardCost(line);
  card = roundMoney(card);
  if (card > 0) return card;
  return roundMoney(stored);
}

/** Satış listesinde kâr = net − maliyet. Alış ve iade kayıtlı kârı korur. */
export function invoiceListDisplayedProfit(inv: InvoiceListEconomicsSource, net?: number): number {
  const category = String(inv.invoice_category || '');
  if (keepsStoredProfit(category)) return roundMoney(finite(inv.gross_profit) ?? 0);
  const payable = net ?? invoiceListPayableNet(inv);
  return roundMoney(payable - invoiceListDisplayedCost(inv));
}

/** Marj = kâr / net × 100. Sıfır nette 0. Alış ve iade kayıtlı yüzdeyi korur. */
export function invoiceListDisplayedMargin(
  inv: InvoiceListEconomicsSource,
  net?: number,
  profit?: number,
): number {
  const category = String(inv.invoice_category || '');
  if (keepsStoredProfit(category)) return roundMoney(finite(inv.profit_margin) ?? 0);
  const payable = net ?? invoiceListPayableNet(inv);
  const gain = profit ?? invoiceListDisplayedProfit(inv, payable);
  if (Math.abs(payable) <= 0.02) return 0;
  return roundMoney((gain / payable) * 100);
}

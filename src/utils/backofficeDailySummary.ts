/**
 * Backoffice Günlük Özet — bugünkü satış, kâr ve stok.
 *
 * Fiş tarihi iş günüdür (`YYYY-MM-DD` veya gün ortası / gece çıpası).
 * `new Date(tarih) >= yerel gece yarısı` karşılaştırması, UTC gece yarısını
 * eksi saat diliminde bir önceki akşama iter; Detaylı Satış 20.10.2026
 * yazarken Bugünkü Satış 0 kalır, aynı fişler Haftalık karta düşer.
 *
 * Net satış, Detaylı Satış ve Kar/Zarar ile aynıdır:
 * brüt hizmet + brüt ürün − iade (bir kez). Peşinat ciro değildir
 * ve kâra eklenmez, kârdan düşülmez.
 * Ürün SMM, envanter listesi birim alışıdır
 * (ağırlıklı ortalama → katman ortalaması → kart alış).
 * Hizmet SMM, Kar-Zarar ile aynı birimdir:
 * satır unit_cost → hizmet kartı alış → kart maliyeti, × miktar.
 * Dolu hizmet maliyeti sıfır kartla silinmez. Satış fiyatı SMM değildir.
 */
import { isBusinessDayClockAnchor } from './saleWallClock';
import { toSqlDateInputString } from './localCalendarDate';
import { detailedSalesLineMoney } from './detailedSalesLineSign';
import { isDepositSale } from './reportDepositFilter';
import { isDepositProductLine } from './beautyDepositAllocation';
import {
  foldProfitLossLines,
  summarizeProfitLossReturns,
  type ProfitLossDepositLine,
} from './profitLossDeposit';
import { periodSummaryHeadline } from './periodSummaryNet';
import {
  inventoryListSalesValue,
  inventoryListStockValue,
  inventoryListUnitPurchaseCost,
} from './inventoryListValue';
import { productCardUnitCost } from './productCardUnitCost';
import { grossProfitAfterCogs, productCogsFromUnitPurchase } from './productSaleCogs';
import {
  PURCHASE_RETURN_TRCODE,
  isExplicitProductItemType,
  isServiceLineType,
} from './lastPurchaseCostSql';

const CANCELLED = new Set([
  'cancelled',
  'canceled',
  'void',
  'iptal',
  'silindi',
  'deleted',
]);

const SKIP_LINE = new Set(['promosyon', 'indirim', 'discount']);

export interface BackofficeSummaryItem {
  productId?: string | null;
  product_id?: string | null;
  productName?: string | null;
  product_name?: string | null;
  productCode?: string | null;
  product_code?: string | null;
  quantity?: number | null;
  price?: number | null;
  unitPrice?: number | null;
  total?: number | null;
  /** Birim maliyet. Kar-Zarar hizmet SMM’si bu alanı miktarla çarpar. */
  cost?: number | null;
  unit_cost?: number | null;
  unitCost?: number | null;
  lineType?: string | null;
  item_type?: string | null;
  type?: string | null;
}

export interface BackofficeSummarySale {
  id?: string | null;
  receiptNumber?: string | null;
  date?: string | Date | number | null;
  invoice_date?: string | Date | number | null;
  created_at?: string | Date | number | null;
  status?: string | null;
  paymentStatus?: string | null;
  payment_status?: string | null;
  notes?: string | null;
  total?: number | null;
  trcode?: number | null;
  invoice_type?: number | null;
  fiche_type?: string | null;
  ficheType?: string | null;
  isDeposit?: boolean | null;
  saleGroupId?: string | null;
  parentSaleId?: string | null;
  items?: BackofficeSummaryItem[] | null;
}

export interface BackofficeStockProduct {
  id?: string | null;
  code?: string | null;
  barcode?: string | null;
  name?: string | null;
  stock?: number | null;
  price?: number | null;
  cost?: number | null;
  purchase_price?: number | null;
  purchasePrice?: number | null;
  average_unit_cost?: number | null;
  layeredAvg?: number | null;
  isService?: boolean | null;
  materialType?: string | null;
}

export interface BackofficeDayFigures {
  netSales: number;
  /** İade tutarı. Artı büyüklük. Netten bir kez düşülür. */
  returnAmount: number;
  /** Peşinat. Ciroya eklenmez, netten düşülmez. */
  depositAmount: number;
  transactionCount: number;
  cogs: number;
  profit: number;
  marginPercent: number;
}

export interface BackofficeTrendDay {
  dateKey: string;
  netSales: number;
  transactionCount: number;
}

export interface BackofficeDailyStrip {
  todayKey: string;
  today: BackofficeDayFigures;
  yesterday: BackofficeDayFigures;
  week: BackofficeDayFigures;
  trend: BackofficeTrendDay[];
  stockValueCost: number;
  stockValueSale: number;
  revenueChangePercent: number;
  profitChangePercent: number;
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function trLower(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

/** Yazılı iş günü. UTC gece yarısı / öğle çıpasi yerel güne kaymaz. */
export function backofficeBusinessDateKey(
  input: string | Date | number | null | undefined,
): string {
  if (input == null || input === '') return '';
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return '';
    if (isBusinessDayClockAnchor(input)) {
      const y = input.getUTCFullYear();
      const m = String(input.getUTCMonth() + 1).padStart(2, '0');
      const d = String(input.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return toSqlDateInputString(input);
  }
  return toSqlDateInputString(input);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((part) => parseInt(part, 10));
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function saleDateKey(sale: BackofficeSummarySale): string {
  const written = backofficeBusinessDateKey(sale.date ?? sale.invoice_date);
  if (written) return written;
  return backofficeBusinessDateKey(sale.created_at);
}

function paymentStatusOf(sale: BackofficeSummarySale): string {
  return trLower(sale.paymentStatus ?? sale.payment_status);
}

function isPurchaseFiche(sale: BackofficeSummarySale): boolean {
  const tr = Number(sale.trcode ?? sale.invoice_type ?? 0) || 0;
  if (tr === PURCHASE_RETURN_TRCODE) return true;
  const fiche = trLower(sale.fiche_type ?? sale.ficheType);
  return fiche === 'purchase_invoice' || fiche === 'opening_balance';
}

/** İptal, bekleyen peşinat, peşinat fişi ve alış fişi ciroya girmez. İade girer. */
export function isBackofficeRevenueSale(sale: BackofficeSummarySale): boolean {
  const ps = paymentStatusOf(sale);
  const st = trLower(sale.status);
  if (CANCELLED.has(ps) || CANCELLED.has(st)) return false;
  if (ps === 'pending' || ps === 'awaiting_service') return false;
  if (/\[İPTAL\]/i.test(String(sale.notes ?? ''))) return false;
  if (isDepositSale(sale as Parameters<typeof isDepositSale>[0])) return false;
  if (isPurchaseFiche(sale)) return false;
  return true;
}

function itemTypeOf(item: BackofficeSummaryItem): string {
  return String(item.lineType ?? item.item_type ?? item.type ?? '').trim();
}

function matchProduct(
  item: BackofficeSummaryItem,
  products: BackofficeStockProduct[],
): BackofficeStockProduct | undefined {
  const id = String(item.productId ?? item.product_id ?? '').trim();
  const code = String(item.productCode ?? item.product_code ?? '').trim();
  const name = trLower(item.productName ?? item.product_name);
  return products.find((product) => {
    const pid = String(product.id ?? '').trim();
    const pcode = String(product.code ?? '').trim();
    const pbarcode = String(product.barcode ?? '').trim();
    if (id && (id === pid || id === pcode || id === pbarcode)) return true;
    if (code && (code === pid || code === pcode || code === pbarcode)) return true;
    if (name && trLower(product.name) === name) return true;
    return false;
  });
}

function lineKindOf(
  item: BackofficeSummaryItem,
  products: BackofficeStockProduct[],
): 'product' | 'service' {
  const rawType = itemTypeOf(item);
  if (isServiceLineType(rawType)) return 'service';
  if (isExplicitProductItemType(rawType)) return 'product';
  const product = matchProduct(item, products);
  if (!product) return 'service';
  if (product.isService || trLower(product.materialType) === 'service') return 'service';
  return 'product';
}

function unitPurchaseOf(
  product: BackofficeStockProduct | undefined,
): number {
  if (!product) return 0;
  return inventoryListUnitPurchaseCost({
    weightedAvg: product.average_unit_cost,
    layeredAvg: product.layeredAvg,
    cardUnit: productCardUnitCost(product),
  });
}

function positiveMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isServiceCard(product: BackofficeStockProduct | undefined): boolean {
  if (!product) return false;
  return product.isService === true || trLower(product.materialType) === 'service';
}

/**
 * Hizmet birim SMM. Kar-Zarar sırası:
 * satır unit_cost → kart alış → kart maliyet.
 * Satış fiyatı kullanılmaz. Dolu satır maliyeti, sıfır kartla silinmez.
 */
function serviceUnitPurchase(
  item: BackofficeSummaryItem,
  catalog: BackofficeStockProduct | undefined,
): number {
  const line = positiveMoney(item.cost) || positiveMoney(item.unit_cost) || positiveMoney(item.unitCost);
  if (line > 0) return line;
  if (!isServiceCard(catalog)) return 0;
  return positiveMoney(catalog?.purchase_price)
    || positiveMoney(catalog?.purchasePrice)
    || positiveMoney(catalog?.cost);
}

function emptyDay(): BackofficeDayFigures {
  return {
    netSales: 0,
    returnAmount: 0,
    depositAmount: 0,
    transactionCount: 0,
    cogs: 0,
    profit: 0,
    marginPercent: 0,
  };
}

function depositAmountOf(sale: BackofficeSummarySale): number {
  const items = sale.items || [];
  if (items.length > 0) {
    const fromLines = items.reduce((sum, item) => sum + Math.abs(finite(item.total)), 0);
    if (fromLines > 0) return fromLines;
  }
  return Math.abs(finite(sale.total));
}

function linesOfSale(
  sale: BackofficeSummarySale,
  products: BackofficeStockProduct[],
): ProfitLossDepositLine[] {
  const invoiceId = String(sale.id || sale.receiptNumber || '').trim() || 'fiche';
  const items = (sale.items || []).filter((item) => !SKIP_LINE.has(trLower(itemTypeOf(item))));
  if (items.length === 0) {
    const header = Math.abs(finite(sale.total));
    const money = detailedSalesLineMoney(sale, {
      quantity: header > 0 ? 1 : 0,
      total: header,
      price: header,
    });
    return [{
      invoiceId,
      invoiceNet: money.total,
      productName: '',
      quantity: money.qty,
      total: money.total,
      lineKind: 'service',
      cost: 0,
    }];
  }

  return items.map((item) => {
    const money = detailedSalesLineMoney(sale, {
      quantity: finite(item.quantity),
      total: finite(item.total),
      price: finite(item.price ?? item.unitPrice),
    });
    const kind = lineKindOf(item, products);
    const catalog = matchProduct(item, products);
    return {
      invoiceId,
      invoiceNet: finite(sale.total),
      saleGroupId: sale.saleGroupId,
      parentSaleId: sale.parentSaleId,
      productName: item.productName ?? item.product_name,
      productCode: item.productCode ?? item.product_code ?? catalog?.code,
      productId: item.productId ?? item.product_id ?? catalog?.id,
      lineType: itemTypeOf(item),
      item_type: itemTypeOf(item),
      lineKind: kind,
      quantity: money.qty,
      total: money.total,
      cost: kind === 'service' ? serviceUnitPurchase(item, catalog) : 0,
    };
  });
}

function cogsOf(
  lines: ProfitLossDepositLine[],
  products: BackofficeStockProduct[],
): number {
  let cogs = 0;
  for (const line of lines) {
    if (isDepositProductLine(line)) continue;
    const qty = finite(line.quantity);
    if (line.lineKind === 'service') {
      const own = finite(line.cost);
      if (own > 0) cogs += productCogsFromUnitPurchase(qty, own);
      continue;
    }
    const unit = unitPurchaseOf(matchProduct({
      productId: line.productId,
      productCode: line.productCode,
      productName: line.productName,
    }, products));
    cogs += productCogsFromUnitPurchase(qty, unit);
  }
  return roundMoney(cogs);
}

function summarizeWindow(
  sales: BackofficeSummarySale[],
  products: BackofficeStockProduct[],
  fromKey: string,
  toKey: string,
): BackofficeDayFigures {
  const inWindow = sales.filter((sale) => {
    const key = saleDateKey(sale);
    return Boolean(key) && key >= fromKey && key <= toKey;
  });
  let depositAmount = 0;
  const revenueSales: BackofficeSummarySale[] = [];
  for (const sale of inWindow) {
    if (isDepositSale(sale as Parameters<typeof isDepositSale>[0]) && !isPurchaseFiche(sale)) {
      const ps = paymentStatusOf(sale);
      const st = trLower(sale.status);
      if (CANCELLED.has(ps) || CANCELLED.has(st)) continue;
      depositAmount += depositAmountOf(sale);
    }
    if (!isBackofficeRevenueSale(sale)) continue;
    revenueSales.push(sale);
  }

  const rawLines = revenueSales.flatMap((sale) => linesOfSale(sale, products));
  const folded = foldProfitLossLines(rawLines);
  const split = summarizeProfitLossReturns(folded);
  const headline = periodSummaryHeadline({
    revenue: split.grossRevenue,
    returnsAmount: split.returnAmount,
    returnDeduction: split.returnAmount,
    expenses: 0,
    expenseEnabled: false,
    // Bu şeridin net satışı ciro − iade kalır. Rezervasyon kutusu
    // günlük, aylık ve yıllık rapor netine yazılır; burada ayrı durur.
    reservationDeposit: 0,
  });
  const cogs = cogsOf(folded, products);
  const profitRow = grossProfitAfterCogs(headline.netRevenue, cogs);
  return {
    netSales: roundMoney(headline.netRevenue),
    returnAmount: roundMoney(headline.returnAmount),
    depositAmount: roundMoney(depositAmount),
    transactionCount: revenueSales.length,
    cogs,
    profit: roundMoney(profitRow.profit),
    marginPercent: profitRow.marginPercent,
  };
}

export function backofficeStockValues(products: BackofficeStockProduct[]): {
  cost: number;
  sale: number;
} {
  let cost = 0;
  let sale = 0;
  for (const product of products) {
    if (product.isService || trLower(product.materialType) === 'service') continue;
    const unit = unitPurchaseOf(product);
    const qty = finite(product.stock);
    cost += inventoryListStockValue(qty, unit);
    sale += inventoryListSalesValue(qty, product.price);
  }
  return { cost: roundMoney(cost), sale: roundMoney(sale) };
}

function changePercent(current: number, previous: number): number {
  if (!(previous > 0)) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Günlük Özet şeridi.
 * `now` verilmezse tarayıcının yerel günü bugündür.
 * Haftalık pencere bugün dahil son 8 takvim günüdür (bugün ve 7 gün öncesi).
 * Trend grafiği bugün dahil son 7 gündür.
 */
export function summarizeBackofficeDailyStrip(input: {
  sales: BackofficeSummarySale[];
  products: BackofficeStockProduct[];
  now?: Date;
}): BackofficeDailyStrip {
  const now = input.now instanceof Date && !Number.isNaN(input.now.getTime())
    ? input.now
    : new Date();
  const todayKey = toSqlDateInputString(now);
  const sales = input.sales || [];
  const products = input.products || [];
  const today = todayKey
    ? summarizeWindow(sales, products, todayKey, todayKey)
    : emptyDay();
  const yesterdayKey = todayKey ? addDaysYmd(todayKey, -1) : '';
  const yesterday = yesterdayKey
    ? summarizeWindow(sales, products, yesterdayKey, yesterdayKey)
    : emptyDay();
  const weekFrom = todayKey ? addDaysYmd(todayKey, -7) : '';
  const week = weekFrom && todayKey
    ? summarizeWindow(sales, products, weekFrom, todayKey)
    : emptyDay();
  const trend: BackofficeTrendDay[] = [];
  if (todayKey) {
    for (let offset = 6; offset >= 0; offset -= 1) {
      const dateKey = addDaysYmd(todayKey, -offset);
      const day = summarizeWindow(sales, products, dateKey, dateKey);
      trend.push({
        dateKey,
        netSales: day.netSales,
        transactionCount: day.transactionCount,
      });
    }
  }
  const stock = backofficeStockValues(products);
  return {
    todayKey,
    today,
    yesterday,
    week,
    trend,
    stockValueCost: stock.cost,
    stockValueSale: stock.sale,
    revenueChangePercent: changePercent(today.netSales, yesterday.netSales),
    profitChangePercent: changePercent(today.profit, yesterday.profit),
  };
}

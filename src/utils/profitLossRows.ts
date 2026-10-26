/**
 * Kar-Zarar satır eşlemesi.
 *
 * İade satırında ürün kodu boşsa envanter birimi bulunamaz ve SMM 0 kalır.
 * Birim, aynı addaki satış satırının ağırlıklı ortalama alışından alınır.
 * Satış satırının kendi SMM'si düşülmez; iade miktarı eksi maliyet yazar.
 * Brüt kâr = net satış − SMM.
 *
 * Aynı iade tutarı satış fişinin brütüne ve iade kolonuna da yazıldıysa
 * (miktar satışta kalır, stok adedi ayrı iade satırındadır) o ayna bir kez düşülür.
 * İki ayrı stok iadesi (ikisi de miktarlı, ayrı fiş) burada birleştirilmez.
 * Alış iadesi satış iadesi sayılmaz.
 */
import { productCogsFromUnitPurchase } from './productSaleCogs';
import { productGrossProfitMarginPct } from './productGrossProfitMargin';
import { classifyProductHistoryType } from './lastPurchaseCostSql';
import {
  isExplicitProfitLossProductLine,
  settleProfitLossReturn,
  splitProfitLossLineReturn,
} from './profitLossDeposit';

const QTY_EPS = 0.0001;
const MONEY_EPS = 0.05;
const UNIT_EPS = 0.009;

export type ProfitLossReportGroup = 'product' | 'category' | 'daily' | 'monthly';

export interface ProfitLossSourceLine {
  invoiceId?: string | null;
  invoiceNet?: number | null;
  ficheType?: string | null;
  trcode?: number | null;
  purchaseReturn?: boolean | null;
  productId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  lineKind?: 'product' | 'service' | string | null;
  lineType?: string | null;
  item_type?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  saleDate?: string | null;
  quantity?: number | null;
  total?: number | null;
  cost?: number | null;
}

export interface ProfitLossAnalysisRow {
  productId: string;
  productCode: string;
  productName: string;
  lineKind: 'product' | 'service';
  quantity: number;
  grossRevenue: number;
  returnAmount: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
}

export interface ProfitLossUnitRef {
  productId?: string;
  productCode?: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function nameKey(name: unknown): string {
  return String(name ?? '').trim().toLocaleLowerCase('tr-TR');
}

export function isBlankProfitLossProductCode(code: unknown): boolean {
  const text = String(code ?? '').trim();
  return !text || text === '—' || text === '-' || text === '–';
}

function positiveUnit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) <= MONEY_EPS;
}

export function isProfitLossPurchaseReturn(line: ProfitLossSourceLine): boolean {
  if (line.purchaseReturn === true) return true;
  if (line.ficheType == null && line.trcode == null) return false;
  return classifyProductHistoryType(line.ficheType, line.trcode) === 'purchase_return';
}

function productLine(line: ProfitLossSourceLine): boolean {
  if (isProfitLossPurchaseReturn(line)) return false;
  if (String(line.lineKind || '').trim() === 'service') return false;
  return isExplicitProfitLossProductLine(line);
}

/**
 * Miktarsız eksi tutar, aynı ürünün miktarlı iadesinin kopyasıysa satış brütünden de düşülür.
 * Net değişmez: brüt ve iade aynı tutar kadar azalır.
 */
export function collapseMirroredProfitLossReturns<T extends ProfitLossSourceLine>(lines: T[]): T[] {
  const totals = lines.map((line) => Number(line.total) || 0);
  const drop = new Set<number>();
  const groups = new Map<string, number[]>();
  lines.forEach((line, index) => {
    if (isProfitLossPurchaseReturn(line)) return;
    const kind = String(line.lineKind || '').trim() === 'service' ? 'service' : 'product';
    const key = `${kind}|${nameKey(line.productName)}`;
    const list = groups.get(key) || [];
    list.push(index);
    groups.set(key, list);
  });

  for (const indexes of groups.values()) {
    const phantoms = indexes.filter(
      (i) => totals[i] < -MONEY_EPS && Math.abs(Number(lines[i].quantity) || 0) <= QTY_EPS,
    );
    const stock = indexes.filter(
      (i) => totals[i] < -MONEY_EPS && Math.abs(Number(lines[i].quantity) || 0) > QTY_EPS,
    );
    const used = new Set<number>();
    for (const phantom of phantoms) {
      const amount = Math.abs(totals[phantom]);
      const match = stock.find(
        (i) => !used.has(i) && sameMoney(Math.abs(totals[i]), amount) && sameReturnMirror(lines[phantom], lines[i]),
      );
      if (match == null) continue;
      if (!absorbPositiveGross(lines, indexes, totals, amount, String(lines[phantom].invoiceId || ''))) {
        continue;
      }
      used.add(match);
      drop.add(phantom);
    }
  }

  return lines.flatMap((line, index) => {
    if (drop.has(index)) return [];
    const total = totals[index];
    if (sameMoney(total, Number(line.total) || 0)) return [line];
    return [{ ...line, total }];
  });
}

function sameReturnMirror(phantom: ProfitLossSourceLine, stock: ProfitLossSourceLine): boolean {
  const phantomInvoice = String(phantom.invoiceId || '').trim();
  const stockInvoice = String(stock.invoiceId || '').trim();
  if (phantomInvoice && stockInvoice && phantomInvoice === stockInvoice) return true;
  const phantomNet = Number(phantom.invoiceNet) || 0;
  const stockNet = Number(stock.invoiceNet) || 0;
  return phantomNet > MONEY_EPS && stockNet < -MONEY_EPS;
}

function absorbPositiveGross(
  lines: ProfitLossSourceLine[],
  indexes: number[],
  totals: number[],
  amount: number,
  phantomInvoiceId: string,
): boolean {
  const order = indexes
    .filter((i) => totals[i] > MONEY_EPS)
    .sort((a, b) => {
      const aSame = phantomInvoiceId && String(lines[a].invoiceId || '') === phantomInvoiceId ? 0 : 1;
      const bSame = phantomInvoiceId && String(lines[b].invoiceId || '') === phantomInvoiceId ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
      return totals[b] - totals[a];
    });
  let left = amount;
  const plan: Array<{ index: number; next: number }> = [];
  for (const index of order) {
    if (left <= MONEY_EPS) break;
    const take = Math.min(totals[index], left);
    plan.push({ index, next: round2(totals[index] - take) });
    left = round2(left - take);
  }
  if (left > MONEY_EPS) return false;
  for (const step of plan) totals[step.index] = step.next;
  return true;
}

/**
 * Malzeme SMM = işaretli miktar × birim alış.
 * Kod/id birim vermezse aynı addaki tek birim (satış satırı) uygulanır.
 * İki farklı birim varsa iadeye maliyet uydurulmaz.
 */
export function applyProfitLossLineCosts<T extends ProfitLossSourceLine>(
  lines: T[],
  unitOf?: (ref: ProfitLossUnitRef) => number,
): T[] {
  const direct = lines.map((line) => {
    if (!productLine(line) || !unitOf) return 0;
    return positiveUnit(
      unitOf({
        productId: String(line.productId || '').trim(),
        productCode: isBlankProfitLossProductCode(line.productCode)
          ? ''
          : String(line.productCode || '').trim(),
      }),
    );
  });
  const unitByName = new Map<string, number | null>();
  lines.forEach((line, index) => {
    const unit = direct[index];
    if (!(unit > 0)) return;
    const key = nameKey(line.productName);
    if (!key) return;
    if (!unitByName.has(key)) {
      unitByName.set(key, unit);
      return;
    }
    const prev = unitByName.get(key);
    if (prev == null) return;
    if (Math.abs(prev - unit) > UNIT_EPS) unitByName.set(key, null);
  });

  return lines.map((line, index) => {
    if (!productLine(line)) return line;
    let unit = direct[index];
    if (!(unit > 0)) {
      const named = unitByName.get(nameKey(line.productName));
      if (named && named > 0) unit = named;
    }
    if (!(unit > 0)) return line;
    return { ...line, cost: productCogsFromUnitPurchase(Number(line.quantity) || 0, unit) };
  });
}

export function mapProfitLossAnalysisRows(
  lines: ProfitLossSourceLine[],
  opts: {
    reportType: ProfitLossReportGroup;
    unitOf?: (ref: ProfitLossUnitRef) => number;
  },
): ProfitLossAnalysisRow[] {
  const kept = (lines || []).filter((line) => !isProfitLossPurchaseReturn(line));
  const collapsed = collapseMirroredProfitLossReturns(kept);
  const priced = applyProfitLossLineCosts(collapsed, opts.unitOf);
  const reportType = opts.reportType;

  type Agg = {
    productId: string;
    productCode: string;
    productName: string;
    lineKind: 'product' | 'service';
    quantity: number;
    grossRevenue: number;
    returnAmount: number;
    cost: number;
  };
  const agg = new Map<string, Agg>();
  for (const line of priced) {
    const lineKind: 'product' | 'service' =
      String(line.lineKind || '').trim() === 'service' ? 'service' : 'product';
    const saleDate = String(line.saleDate || '');
    const month = saleDate.slice(0, 7);
    const key = reportType === 'category'
      ? `${lineKind}|${line.categoryCode || ''}|${line.categoryName || ''}`
      : reportType === 'daily'
        ? `${saleDate}|${lineKind}`
        : reportType === 'monthly'
          ? `${month}|${lineKind}`
          : `${lineKind}|${line.productCode || ''}|${line.productName || ''}`;
    const name = reportType === 'category'
      ? String(line.categoryName || '')
      : reportType === 'daily'
        ? saleDate
        : reportType === 'monthly'
          ? month
          : String(line.productName || '');
    const code = reportType === 'category'
      ? String(line.categoryCode || '')
      : reportType === 'daily' || reportType === 'monthly'
        ? name
        : String(line.productCode || '');
    const cur = agg.get(key) || {
      productId: reportType === 'product' ? String(line.productId || '') : '',
      productCode: code,
      productName: name,
      lineKind,
      quantity: 0,
      grossRevenue: 0,
      returnAmount: 0,
      cost: 0,
    };
    const part = splitProfitLossLineReturn(Number(line.total) || 0);
    cur.quantity += Number(line.quantity) || 0;
    cur.grossRevenue += part.grossRevenue;
    cur.returnAmount += part.returnAmount;
    cur.cost += Number(line.cost) || 0;
    if (!cur.productId && line.productId && reportType === 'product') cur.productId = String(line.productId);
    agg.set(key, cur);
  }

  const aggregated = Array.from(agg.values()).filter(
    (row) => Math.abs(row.quantity) > QTY_EPS
      || Math.abs(row.grossRevenue) > MONEY_EPS
      || Math.abs(row.returnAmount) > MONEY_EPS,
  );
  aggregated.sort((a, b) => {
    if (reportType === 'daily' || reportType === 'monthly') {
      const byName = b.productName.localeCompare(a.productName);
      if (byName !== 0) return byName;
      return a.lineKind.localeCompare(b.lineKind);
    }
    const aNet = settleProfitLossReturn(a.grossRevenue, a.returnAmount).netRevenue;
    const bNet = settleProfitLossReturn(b.grossRevenue, b.returnAmount).netRevenue;
    return (bNet - b.cost) - (aNet - a.cost);
  });

  return aggregated.map((row) => {
    const settled = settleProfitLossReturn(row.grossRevenue, row.returnAmount);
    const revenue = settled.netRevenue;
    const cost = round2(row.cost);
    const profit = round2(revenue - cost);
    return {
      productId: row.productId,
      productCode: row.productCode,
      productName: row.productName,
      lineKind: row.lineKind,
      quantity: row.quantity,
      grossRevenue: settled.grossRevenue,
      returnAmount: settled.returnAmount,
      revenue,
      cost,
      profit,
      profitMargin: productGrossProfitMarginPct(revenue, profit),
    };
  });
}

export function sumProfitLossAnalysis(rows: ProfitLossAnalysisRow[]): {
  quantity: number;
  grossRevenue: number;
  returnAmount: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
} {
  let quantity = 0;
  let grossRevenue = 0;
  let returnAmount = 0;
  let revenue = 0;
  let cost = 0;
  let profit = 0;
  for (const row of rows) {
    quantity += row.quantity;
    grossRevenue += row.grossRevenue;
    returnAmount += row.returnAmount;
    revenue += row.revenue;
    cost += row.cost;
    profit += row.profit;
  }
  return {
    quantity: round2(quantity),
    grossRevenue: round2(grossRevenue),
    returnAmount: round2(returnAmount),
    revenue: round2(revenue),
    cost: round2(cost),
    profit: round2(profit),
    marginPct: productGrossProfitMarginPct(revenue, profit),
  };
}

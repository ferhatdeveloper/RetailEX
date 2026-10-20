/**
 * Güzellik Ürün Satış Raporu — net miktar ve net ciro.
 *
 * Kök neden: rapor yalnızca `beauty_sales` içinde `payment_status = paid`
 * ürün kalemlerini artı toplar. Satış iadesi bu tabloya yazılmaz; ERP
 * `sales` fişinde durur (`trcode` 2/3 veya `fiche_type = return_invoice`,
 * tutar ve miktar veritabanında pozitif). Karlılık bu fişi eksi işaretler,
 * ürün satış raporu fişi hiç görmez. Bu yüzden 2 adet / 20.000 brüt kalır,
 * net 1 adet / 10.000 görünmez.
 *
 * Muhasebe: satış artı, iade eksi. Net ciro = satış − iade.
 * Net miktar = satılan − iade edilen. Aynı iade satırı bir kez düşülür
 * (satır hem küçültülüp hem ikinci kez eksi yazılmaz).
 * Hizmet ve depozito satırları bu rapora girmez.
 */
import { classifyProductHistoryType } from './lastPurchaseCostSql';
import { isProductSalesMaterialLineType } from './productSalesReportFilters';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BeautyProductSaleNetInput = {
  productId: string;
  productName: string;
  productCode: string;
  productBarcode: string;
  categoryName: string;
  subCategoryName: string;
  quantity: number;
  total: number;
};

/** ERP satış iadesi kalemi. Tutar/miktar kaynakta pozitif de olabilir. */
export type BeautyProductReturnLine = {
  saleId: string;
  lineId: string;
  ficheNo: string;
  date: string;
  customerName: string;
  paymentMethod: string;
  cashier: string;
  trcode: number | null;
  ficheType: string;
  productId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  netAmount: number;
  totalAmount: number;
};

export type BeautyProductReturnApplication = {
  sourceLineId: string;
  saleId: string;
  date: string;
  customerName: string;
  paymentMethod: string;
  staffName: string;
  productId: string;
  productName: string;
  productCode: string;
  productBarcode: string;
  productCodeDisplay: string;
  categoryName: string;
  subCategoryName: string;
  /** Eksi miktar (bir kez). */
  quantity: number;
  /** Birim fiyat artı kalır. */
  unitPrice: number;
  /** Eksi tutar (bir kez). */
  total: number;
};

export type BeautyProductSalesSummary = {
  transactionCount: number;
  lineCount: number;
  totalQty: number;
  totalRevenue: number;
};

type ProductPool = {
  qty: number;
  amount: number;
  aliases: Set<string>;
  sample: BeautyProductSaleNetInput;
};

function trKey(value: string): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value ?? '').trim());
}

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Depozito / peşinat satırı — ürün cirosundan düşülmez. */
export function isBeautyDepositProductLine(
  itemType: string | null | undefined,
  itemName: string | null | undefined,
  itemCode: string | null | undefined,
): boolean {
  const t = trKey(String(itemType ?? ''));
  const n = trKey(String(itemName ?? ''));
  const c = trKey(String(itemCode ?? ''));
  if (t === 'deposit' || t === 'depozito') return true;
  if (n === 'deposit' || n === 'depozito' || n === 'peşinat' || n === 'pesinat' || n === 'rezervasyon') {
    return true;
  }
  if (
    n.startsWith('depozito') ||
    n.startsWith('deposit') ||
    n.startsWith('peşinat') ||
    n.startsWith('pesinat')
  ) {
    return true;
  }
  return c === 'deposit' || c === 'depozito';
}

function addAlias(target: Set<string>, kind: 'id' | 'code' | 'name', raw: string): void {
  const text = String(raw ?? '').trim();
  if (!text || text === '—' || text === '-') return;
  if (kind === 'id') {
    if (isUuid(text)) target.add(`id:${text.toLowerCase()}`);
    return;
  }
  if (kind === 'code') {
    if (!isUuid(text)) target.add(`code:${trKey(text)}`);
    return;
  }
  const name = trKey(text);
  if (name && name !== '—') target.add(`name:${name}`);
}

function saleAliases(row: BeautyProductSaleNetInput): Set<string> {
  const aliases = new Set<string>();
  addAlias(aliases, 'id', row.productId);
  if (!isUuid(row.productId)) addAlias(aliases, 'code', row.productId);
  addAlias(aliases, 'code', row.productCode);
  addAlias(aliases, 'code', row.productBarcode);
  addAlias(aliases, 'name', row.productName);
  return aliases;
}

function returnAliases(line: BeautyProductReturnLine): { ids: string[]; codes: string[]; names: string[] } {
  const ids: string[] = [];
  const codes: string[] = [];
  const names: string[] = [];
  const pushId = (raw: string) => {
    const text = String(raw ?? '').trim();
    if (isUuid(text)) ids.push(`id:${text.toLowerCase()}`);
  };
  const pushCode = (raw: string) => {
    const text = String(raw ?? '').trim();
    if (text && !isUuid(text) && text !== '—') codes.push(`code:${trKey(text)}`);
  };
  pushId(line.productId);
  pushId(line.itemCode);
  pushCode(line.productId);
  pushCode(line.itemCode);
  const name = trKey(line.itemName);
  if (name && name !== '—') names.push(`name:${name}`);
  return { ids, codes, names };
}

function findPool(pools: ProductPool[], keys: string[]): ProductPool | null {
  for (const key of keys) {
    const pool = pools.find((p) => p.aliases.has(key));
    if (pool && (pool.qty > 1e-9 || pool.amount > 1e-6)) return pool;
  }
  return null;
}

/** İade tutarı: net, yoksa satır toplamı, yoksa miktar × fiyat. Alanlar toplanmaz. */
export function beautyReturnLineAmount(line: Pick<BeautyProductReturnLine, 'quantity' | 'unitPrice' | 'netAmount' | 'totalAmount'>): number {
  const net = finite(line.netAmount);
  if (net !== 0) return net;
  const total = finite(line.totalAmount);
  if (total !== 0) return total;
  return finite(line.quantity) * finite(line.unitPrice);
}

function isSalesReturnLine(line: BeautyProductReturnLine): boolean {
  return classifyProductHistoryType(line.ficheType, line.trcode) === 'sales_return';
}

function isProductReturnLine(line: BeautyProductReturnLine): boolean {
  if (!isSalesReturnLine(line)) return false;
  if (isBeautyDepositProductLine(line.itemType, line.itemName, line.itemCode)) return false;
  return isProductSalesMaterialLineType(line.itemType);
}

/**
 * Brüt ürün satırlarına karşılık iade uygulamaları.
 * Satış satırları değiştirilmez. Her iade kalemi en fazla bir kez düşülür.
 * Düşüm, aynı üründen bu raporda satılan miktar ve tutarı aşmaz.
 */
export function planBeautyProductReturns(
  sales: BeautyProductSaleNetInput[],
  returns: BeautyProductReturnLine[],
): BeautyProductReturnApplication[] {
  const pools: ProductPool[] = [];
  for (const row of sales) {
    const qty = finite(row.quantity);
    const amount = finite(row.total);
    if (qty <= 1e-9 && amount <= 1e-6) continue;
    const aliases = saleAliases(row);
    if (aliases.size === 0) continue;
    const existing = pools.find((pool) => {
      for (const alias of aliases) {
        if (pool.aliases.has(alias)) return true;
      }
      return false;
    });
    if (existing) {
      existing.qty += Math.max(0, qty);
      existing.amount += Math.max(0, amount);
      for (const alias of aliases) existing.aliases.add(alias);
    } else {
      pools.push({
        qty: Math.max(0, qty),
        amount: Math.max(0, amount),
        aliases,
        sample: row,
      });
    }
  }

  const seen = new Set<string>();
  const ordered = [...returns].sort((a, b) => {
    const date = String(a.date).localeCompare(String(b.date));
    if (date !== 0) return date;
    const fiche = String(a.ficheNo).localeCompare(String(b.ficheNo));
    if (fiche !== 0) return fiche;
    return String(a.lineId).localeCompare(String(b.lineId));
  });

  const out: BeautyProductReturnApplication[] = [];
  for (const line of ordered) {
    const lineKey = String(line.lineId || '').trim();
    const dedupeKey = lineKey
      ? `id:${lineKey}`
      : `row:${line.ficheNo}|${line.productId}|${line.itemCode}|${line.itemName}|${line.quantity}|${line.netAmount}|${line.totalAmount}`;
    if (seen.has(dedupeKey)) continue;
    if (!isProductReturnLine(line)) continue;

    const keys = returnAliases(line);
    const pool =
      findPool(pools, keys.ids) ||
      findPool(pools, keys.codes) ||
      findPool(pools, keys.names);
    if (!pool) continue;

    const magQty = Math.abs(finite(line.quantity));
    const magAmt = Math.abs(beautyReturnLineAmount(line));
    let takeQty = magQty;
    let takeAmt = magAmt;
    if (takeQty > pool.qty + 1e-9) {
      const ratio = pool.qty <= 1e-9 || takeQty <= 1e-9 ? 0 : pool.qty / takeQty;
      takeQty = pool.qty;
      takeAmt = magAmt * ratio;
    }
    if (takeAmt > pool.amount + 1e-6) {
      const ratio = pool.amount <= 1e-6 || takeAmt <= 1e-6 ? 0 : pool.amount / takeAmt;
      takeAmt = pool.amount;
      takeQty = takeQty * ratio;
    }
    if (takeQty <= 1e-9 && takeAmt <= 1e-6) continue;

    seen.add(dedupeKey);
    pool.qty = Math.max(0, pool.qty - takeQty);
    pool.amount = Math.max(0, pool.amount - takeAmt);

    const returnCode = !isUuid(line.itemCode) ? String(line.itemCode || '').trim() : '';
    const productCode = returnCode || pool.sample.productCode;
    const productBarcode = pool.sample.productBarcode;
    const productId =
      (isUuid(line.productId) ? line.productId : '') ||
      (isUuid(line.itemCode) ? line.itemCode : '') ||
      pool.sample.productId;
    const productName = String(line.itemName || '').trim() || pool.sample.productName;
    const unitPriceRaw = Math.abs(finite(line.unitPrice));
    const unitPrice = unitPriceRaw > 0 ? unitPriceRaw : takeQty > 1e-9 ? Math.abs(takeAmt / takeQty) : 0;
    const dateMatch = String(line.date || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch?.[1] || String(line.date || '').trim();

    out.push({
      sourceLineId: lineKey || dedupeKey,
      saleId: String(line.saleId || '').trim(),
      date,
      customerName: String(line.customerName || '').trim() || '—',
      paymentMethod: String(line.paymentMethod || '').trim() || '—',
      staffName: String(line.cashier || '').trim() || '—',
      productId,
      productName,
      productCode,
      productBarcode,
      productCodeDisplay: productCode || productBarcode || '—',
      categoryName: pool.sample.categoryName || '—',
      subCategoryName: pool.sample.subCategoryName || '—',
      quantity: -takeQty,
      unitPrice,
      total: -takeAmt,
    });
  }

  return out;
}

/** İşlem sayısı iade fişini ayrıca saymaz. Miktar ve ciro işaretli nettir. */
export function summarizeBeautyProductSales(
  rows: Array<{ saleId?: string; quantity?: number; total?: number; isReturn?: boolean }>,
): BeautyProductSalesSummary {
  const transactionCount = new Set(
    rows
      .filter((row) => !row.isReturn)
      .map((row) => String(row.saleId || '').trim())
      .filter(Boolean),
  ).size;
  let totalQty = 0;
  let totalRevenue = 0;
  for (const row of rows) {
    totalQty += finite(row.quantity);
    totalRevenue += finite(row.total);
  }
  return {
    transactionCount,
    lineCount: rows.length,
    totalQty,
    totalRevenue,
  };
}

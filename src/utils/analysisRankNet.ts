/**
 * En Çok Satanlar ve Kategori Performansı — net satış.
 *
 * Kök neden: müşteri iade fişinin başlığı eksi işaretlenir (`status` return,
 * `total` < 0) ama satır miktarı ve satır tutarı veritabanında artı kalır.
 * İki rapor satırı olduğu gibi topladığı için iade ciroya eklenir
 * (2 × 10.000 + 1 × 10.000 = 3 adet / 30.000). Kategori toplamı da
 * 110.000 + 30.000 = 140.000 olur.
 *
 * Muhasebe: satış artı, iade eksi. Net = brüt − |iade|.
 * İade bir kez düşülür. Satır zaten eksiyse ikinci kez çıkarılmaz
 * (20.000 − 10.000 − 10.000 = 0 olmaz). Aynı fiş kimliği listede
 * iki kez varsa bir kez yazılır.
 * İade kendi ürün havuzuna yazılır. Başka ürünün iadesi BOYA'ya gitmez.
 * Peşinat fişi ve depozito satırı ciroya eklenmez.
 * Hizmet satırının kendi tutarı değişmez.
 */
import { isDepositProductLine } from './beautyDepositAllocation';
import { isSalesReturnFiche, PURCHASE_RETURN_TRCODE } from './lastPurchaseCostSql';
import { isReturnSale } from './posZReport';
import { isCompletedAppointmentStatus, isDepositSale } from './reportDepositFilter';
import type { Sale } from '../core/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QTY_EPS = 1e-9;
const MONEY_EPS = 0.004;

export type RankNetItem = {
  productId?: string;
  productName?: string;
  productCode?: string;
  lineType?: string;
  item_type?: string;
  quantity?: number;
  total?: number;
  price?: number;
  discount?: number;
};

export type RankNetSale = {
  id?: string;
  receiptNumber?: string;
  status?: string;
  total?: number;
  notes?: string | null;
  isDeposit?: boolean | null;
  linkedAppointmentId?: string | null;
  trcode?: number | null;
  invoice_type?: number | null;
  fiche_type?: string | null;
  ficheType?: string | null;
  items?: RankNetItem[] | null;
};

export type RankNetLine = {
  saleId: string;
  productId: string;
  productName: string;
  productCode: string;
  lineType: string;
  itemType: string;
  quantity: number;
  total: number;
  price: number;
  /** Satır indirim yüzdesi. Tutar, işaretli miktar ile çarpılır. */
  discount: number;
  isReturn: boolean;
};

export type RankProductRow = {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
  discount: number;
  avgPrice: number;
};

export type RankCategoryItem = {
  product_name: string;
  quantity: number;
  subtotal: number;
};

export type RankCategoryRow = {
  name: string;
  totalRevenue: number;
  totalQuantity: number;
  productCount: number;
  avgPrice: number;
  items: RankCategoryItem[];
};

export type RankNetSummary = {
  products: RankProductRow[];
  categories: RankCategoryRow[];
};

type RankPool = {
  productId: string;
  productName: string;
  categoryName: string;
  aliases: Set<string>;
  quantity: number;
  revenue: number;
  discount: number;
  inTop: boolean;
};

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function trKey(value: string): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value ?? '').trim());
}

function nearZero(quantity: number, amount: number): boolean {
  return Math.abs(quantity) <= QTY_EPS && Math.abs(amount) <= MONEY_EPS;
}

function avgPrice(amount: number, quantity: number): number {
  return Math.abs(quantity) > QTY_EPS ? amount / quantity : 0;
}

/**
 * İade satırının büyüklüğü bir kez eksi yazılır.
 * Girdi zaten eksiyse sonuç aynı kalır; ikinci çağrı 0 üretmez.
 */
export function signedRankAmount(
  isReturn: boolean,
  quantity: number,
  total: number,
): { quantity: number; total: number } {
  const qty = finite(quantity);
  const amt = finite(total);
  if (!isReturn) return { quantity: qty, total: amt };
  return { quantity: -Math.abs(qty), total: -Math.abs(amt) };
}

function lineMoney(item: RankNetItem): number {
  const total = finite(item.total);
  if (total !== 0) return total;
  return finite(item.quantity) * finite(item.price);
}

function saleTrcode(sale: RankNetSale): number {
  return Number(sale.trcode ?? sale.invoice_type ?? 0);
}

function saleFicheType(sale: RankNetSale): string {
  return String(sale.fiche_type ?? sale.ficheType ?? '');
}

/** Alış iadesi satış cirosundan düşülmez. */
export function isPurchaseReturnDocument(sale: RankNetSale): boolean {
  if (saleTrcode(sale) === PURCHASE_RETURN_TRCODE) return true;
  const fiche = saleFicheType(sale).trim().toLowerCase();
  return fiche === 'purchase_invoice';
}

function isCancelledDocument(sale: RankNetSale): boolean {
  const status = String(sale.status ?? '').trim().toLowerCase();
  return (
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'silindi' ||
    status === 'iptal' ||
    status === 'void' ||
    status === 'deleted'
  );
}

/** Müşteri satış iadesi. Alış iadesi burada değildir. */
export function isCustomerReturnDocument(sale: RankNetSale): boolean {
  if (isPurchaseReturnDocument(sale)) return false;
  if (isReturnSale(sale as Sale)) return true;
  const trcode = saleTrcode(sale);
  if (trcode === 2 || trcode === 3) return true;
  return isSalesReturnFiche({ fiche_type: saleFicheType(sale), trcode });
}

function documentKey(sale: RankNetSale, index: number): string {
  const id = String(sale.id ?? '').trim();
  if (id) return `id:${id}`;
  const receipt = String(sale.receiptNumber ?? '').trim();
  if (receipt) return `receipt:${receipt}`;
  return `row:${index}`;
}

function skipWholeDocument(sale: RankNetSale, isReturn: boolean): boolean {
  if (isPurchaseReturnDocument(sale)) return true;
  if (isCancelledDocument(sale)) return true;
  if (isDepositSale(sale as Partial<Sale>)) return true;
  if (!isReturn) {
    const linked = String(sale.linkedAppointmentId ?? '').trim();
    if (linked && !isCompletedAppointmentStatus(sale.status)) return true;
  }
  return false;
}

function isDepositLine(item: RankNetItem): boolean {
  return isDepositProductLine({
    productName: item.productName,
    productCode: item.productCode,
    productId: item.productId,
    lineType: item.lineType,
    item_type: item.item_type,
  });
}

/** İşaretlenmiş satırlar. Peşinat ve tekrar eden fiş kimliği yoktur. */
export function collectRankNetLines(sales: readonly RankNetSale[]): RankNetLine[] {
  const seen = new Set<string>();
  const out: RankNetLine[] = [];
  (sales || []).forEach((sale, index) => {
    const key = documentKey(sale, index);
    if (!key.startsWith('row:')) {
      if (seen.has(key)) return;
      seen.add(key);
    }
    const isReturn = isCustomerReturnDocument(sale);
    if (skipWholeDocument(sale, isReturn)) return;
    const saleId = String(sale.id ?? sale.receiptNumber ?? index);
    for (const item of sale.items || []) {
      if (isDepositLine(item)) continue;
      const rawQty = finite(item.quantity);
      const rawTotal = lineMoney(item);
      const signed = signedRankAmount(isReturn, rawQty, rawTotal);
      if (nearZero(signed.quantity, signed.total)) continue;
      out.push({
        saleId,
        productId: String(item.productId ?? '').trim(),
        productName: String(item.productName ?? '').trim(),
        productCode: String(item.productCode ?? '').trim(),
        lineType: String(item.lineType ?? '').trim(),
        itemType: String(item.item_type ?? item.lineType ?? '').trim(),
        quantity: signed.quantity,
        total: signed.total,
        price: finite(item.price),
        discount: finite(item.discount),
        isReturn,
      });
    }
  });
  return out;
}

function addAlias(target: Set<string>, kind: 'id' | 'code' | 'name' | 'key', raw: string): void {
  const text = String(raw ?? '').trim();
  if (!text || text === '—' || text === '-') return;
  if (kind === 'id') {
    target.add(`id:${text.toLowerCase()}`);
    if (!isUuid(text)) target.add(`code:${trKey(text)}`);
    return;
  }
  if (kind === 'code') {
    if (!isUuid(text)) target.add(`code:${trKey(text)}`);
    return;
  }
  if (kind === 'key') {
    target.add(`key:${trKey(text)}`);
    return;
  }
  const name = trKey(text);
  if (name && name !== '—') target.add(`name:${name}`);
}

function lineAliases(line: RankNetLine, productKey: string): Set<string> {
  const aliases = new Set<string>();
  addAlias(aliases, 'id', line.productId);
  addAlias(aliases, 'code', line.productCode);
  addAlias(aliases, 'name', line.productName);
  addAlias(aliases, 'key', productKey);
  return aliases;
}

const ALIAS_KINDS = ['id:', 'code:', 'key:', 'name:'] as const;

/**
 * Önce kimlik, sonra kod, sonra anahtar, en son ad.
 * Ad birden fazla ürüne uyuyorsa eşleşme yapılmaz.
 */
function findPool(pools: RankPool[], aliases: Set<string>): RankPool | null {
  for (const kind of ALIAS_KINDS) {
    const hits: RankPool[] = [];
    for (const alias of aliases) {
      if (!alias.startsWith(kind)) continue;
      for (const pool of pools) {
        if (pool.aliases.has(alias) && !hits.includes(pool)) hits.push(pool);
      }
    }
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function discountAmount(line: RankNetLine): number {
  return (line.quantity * line.price * line.discount) / 100;
}

export function summarizeRankNet(
  sales: readonly RankNetSale[],
  opts: {
    categoryOf: (line: RankNetLine) => string;
    productKeyOf?: (line: RankNetLine) => string;
    productNameOf?: (line: RankNetLine) => string;
    /** false ise En Çok Satanlar listesine yazılmaz. Kategoriye yazılır. */
    inTopSellers?: (line: RankNetLine) => boolean;
  },
): RankNetSummary {
  const lines = collectRankNetLines(sales);
  const pools: RankPool[] = [];

  const absorb = (line: RankNetLine) => {
    const productKey = String(opts.productKeyOf?.(line) || line.productId || line.productName || '—').trim() || '—';
    const productName = String(opts.productNameOf?.(line) || line.productName || '—').trim() || '—';
    const categoryName = String(opts.categoryOf(line) || '—').trim() || '—';
    const aliases = lineAliases(line, productKey);
    const existing = findPool(pools, aliases);
    if (existing) {
      existing.quantity += line.quantity;
      existing.revenue += line.total;
      existing.discount += discountAmount(line);
      if (!existing.productId && line.productId) existing.productId = line.productId;
      if (productName && productName !== '—') existing.productName = productName;
      for (const alias of aliases) existing.aliases.add(alias);
      if (!opts.inTopSellers || opts.inTopSellers(line)) existing.inTop = true;
      return;
    }
    pools.push({
      productId: line.productId,
      productName,
      categoryName,
      aliases,
      quantity: line.quantity,
      revenue: line.total,
      discount: discountAmount(line),
      inTop: !opts.inTopSellers || opts.inTopSellers(line),
    });
  };

  for (const line of lines) {
    if (!line.isReturn) absorb(line);
  }
  for (const line of lines) {
    if (line.isReturn) absorb(line);
  }

  const visible = pools.filter((pool) => !nearZero(pool.quantity, pool.revenue));

  const products: RankProductRow[] = visible
    .filter((pool) => pool.inTop)
    .map((pool) => ({
      productId: pool.productId,
      productName: pool.productName,
      quantity: pool.quantity,
      revenue: pool.revenue,
      discount: pool.discount,
      avgPrice: avgPrice(pool.revenue, pool.quantity),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity);

  const byCategory = new Map<string, RankPool[]>();
  for (const pool of visible) {
    const list = byCategory.get(pool.categoryName);
    if (list) list.push(pool);
    else byCategory.set(pool.categoryName, [pool]);
  }

  const categories: RankCategoryRow[] = Array.from(byCategory.entries())
    .map(([name, group]) => {
      const totalRevenue = group.reduce((sum, pool) => sum + pool.revenue, 0);
      const totalQuantity = group.reduce((sum, pool) => sum + pool.quantity, 0);
      const items = group
        .map((pool) => ({
          product_name: pool.productName,
          quantity: pool.quantity,
          subtotal: pool.revenue,
        }))
        .sort((a, b) => b.subtotal - a.subtotal);
      return {
        name,
        totalRevenue,
        totalQuantity,
        productCount: items.length,
        avgPrice: avgPrice(totalRevenue, totalQuantity),
        items,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return { products, categories };
}

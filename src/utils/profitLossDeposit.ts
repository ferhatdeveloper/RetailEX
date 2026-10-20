/**
 * Kar-zarar satırları: depozito kendi ürünü değildir.
 * Pay, aynı fişin (veya aynı satış grubunun) hizmetlerine bir kez yazılır.
 * Maliyet depozito satırında kalmaz; brüt kâr = dağıtılmış net satış − SMM.
 * Canlı randevu formuna yazılmaz.
 */
import {
  foldDepositRevenueIntoServices,
  isDepositProductLine,
} from './beautyDepositAllocation';
import { isExplicitProductItemType } from './lastPurchaseCostSql';

export interface ProfitLossDepositLine {
  invoiceId?: string | null;
  invoiceNet?: number | null;
  saleGroupId?: string | null;
  parentSaleId?: string | null;
  productName?: string | null;
  productCode?: string | null;
  productId?: string | null;
  lineType?: string | null;
  lineKind?: 'product' | 'service' | string | null;
  item_type?: string | null;
  quantity?: number | null;
  total?: number | null;
  cost?: number | null;
  depositAmount?: number | null;
  ficheDeposits?: Array<number | null> | null;
  /** Randevuda tahsil edilen kalan. Hizmet tutarına eşitse satır, depozito düşülmüş halidir. */
  ficheRemainders?: Array<number | null> | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Aynı tutar her satıra kopyalandıysa bir kez döner; işaret korunur. */
function sameCopiedAmount(values: number[]): number | null {
  const list = values.filter((n) => Math.abs(n) > 0.004);
  if (list.length === 0) return null;
  const keys = [...new Set(list.map((n) => Math.abs(n).toFixed(2)))];
  if (keys.length !== 1) return null;
  const mag = Number(keys[0]);
  const neg = list.some((n) => n < 0);
  const pos = list.some((n) => n > 0);
  if (neg && pos) return null;
  return (neg ? -1 : 1) * mag;
}

function moneyList(values: Array<number | null> | null | undefined): number[] {
  return (values || []).map((n) => Number(n) || 0).filter((n) => Math.abs(n) > 0.004);
}

function pooledAmount(values: number[]): number {
  if (values.length === 0) return 0;
  const copied = sameCopiedAmount(values);
  if (copied != null) return copied;
  return round2(values.reduce((sum, n) => sum + n, 0));
}

function serviceMoneySum(items: ProfitLossDepositLine[]): number {
  return round2(
    items.reduce((sum, item) => {
      if (isDepositProductLine(item)) return sum;
      return sum + (Number(item.total) || 0);
    }, 0),
  );
}

/**
 * Depozito havuzu: satır, sonra hizmetin kendi depozitosu, sonra fiş listesi.
 * Aynı tutar birden fazla satırda duruyorsa bir kez sayılır.
 */
function depositPoolOf(items: ProfitLossDepositLine[]): number {
  const lineAmounts = items
    .filter((item) => isDepositProductLine(item))
    .map((item) => Number(item.total) || 0)
    .filter((n) => Math.abs(n) > 0.004);
  // Satır tutarları toplanır. Fişler arası kopya, bundan önce tek satıra inmiştir.
  if (lineAmounts.length > 0) return round2(lineAmounts.reduce((sum, n) => sum + n, 0));

  const services = items.filter((item) => !isDepositProductLine(item));
  const owns = services.map((item) => Number(item.depositAmount) || 0);
  if (owns.some((n) => Math.abs(n) > 0.004)) {
    const every = owns.every((n) => Math.abs(n) > 0.004);
    if (every) {
      const copied = sameCopiedAmount(owns);
      if (copied != null) return copied;
    }
    return round2(owns.reduce((sum, n) => sum + n, 0));
  }

  const fiche = moneyList(items.find((item) => moneyList(item.ficheDeposits).length > 0)?.ficheDeposits);
  return pooledAmount(fiche);
}

function remainderOf(items: ProfitLossDepositLine[]): number {
  const list = moneyList(items.find((item) => moneyList(item.ficheRemainders).length > 0)?.ficheRemainders);
  return pooledAmount(list);
}

/**
 * Fiş neti.
 * Kalan + depozito hizmete eşitse hizmet brüttür; depozito ikinci kez eklenmez.
 * Kalan hizmete eşitse hizmet, depozito düşülmüş tutardır; ticari net ikisinin toplamıdır.
 * Kalan yoksa başlıktaki fiş neti geçerlidir (35.000 + fiş neti 50.000).
 */
function resolveProfitLossInvoiceNet(
  serviceSum: number,
  pool: number,
  headerNet: number,
  remainderSum: number,
): number {
  if (!(Math.abs(pool) > 0.004)) return headerNet;
  if (Math.abs(remainderSum) > 0.004) {
    const tol = Math.max(1, Math.abs(serviceSum) * 0.002, Math.abs(pool) * 0.002);
    if (Math.abs(remainderSum + pool - serviceSum) <= tol) return serviceSum;
    if (Math.abs(remainderSum - serviceSum) <= tol) return round2(serviceSum + pool);
  }
  return headerNet;
}

function invoiceKey(line: ProfitLossDepositLine): string {
  return String(line.invoiceId || '').trim();
}

function groupKey(line: ProfitLossDepositLine): string {
  const group = String(line.saleGroupId || '').trim();
  if (group) return `g:${group}`;
  const parent = String(line.parentSaleId || '').trim();
  if (parent) return `g:${parent}`;
  return `i:${invoiceKey(line)}`;
}

/** Açık ürün satırı. Depozito ürün değildir. Tür yoksa eski hizmet satırları ürün sanılmaz. */
export function isExplicitProfitLossProductLine(line: ProfitLossDepositLine): boolean {
  if (isDepositProductLine(line)) return false;
  const kind = String(line.lineKind || '').trim().toLocaleLowerCase('tr-TR');
  if (kind === 'product') return true;
  if (kind === 'service') return false;
  return isExplicitProductItemType(line.lineType || line.item_type);
}

export function filterProfitLossByKind<T extends ProfitLossDepositLine>(
  lines: T[],
  kind: 'all' | 'product' | 'service',
): T[] {
  if (kind === 'all') return lines;
  return lines.filter((line) => {
    const rowKind = String(line.lineKind || '').trim() === 'service' ? 'service' : 'product';
    return rowKind === kind;
  });
}

function isDepositOnlyInvoice(lines: ProfitLossDepositLine[]): boolean {
  return lines.length > 0 && lines.every((line) => isDepositProductLine(line));
}

function headerNetOf(lines: ProfitLossDepositLine[]): number {
  const byInvoice = new Map<string, ProfitLossDepositLine[]>();
  for (const line of lines) {
    const id = invoiceKey(line) || `row:${byInvoice.size}`;
    const bucket = byInvoice.get(id);
    if (bucket) bucket.push(line);
    else byInvoice.set(id, [line]);
  }
  let sum = 0;
  let sawService = false;
  for (const group of byInvoice.values()) {
    if (isDepositOnlyInvoice(group)) continue;
    sawService = true;
    sum += Number(group[0]?.invoiceNet) || 0;
  }
  if (sawService) return round2(sum);
  return round2(
    [...byInvoice.values()].reduce((total, group) => total + (Number(group[0]?.invoiceNet) || 0), 0),
  );
}

/** Ayrı peşinat fişindeki aynı tutar, hizmet fişine ikinci kez yazılmasın. */
function collapseCopiedDepositLines<T extends ProfitLossDepositLine>(lines: T[]): T[] {
  const deposits = lines.filter((line) => isDepositProductLine(line));
  const services = lines.filter((line) => !isDepositProductLine(line));
  const invoices = new Set(deposits.map((line) => invoiceKey(line)));
  if (invoices.size <= 1) return lines;
  const copied = sameCopiedAmount(deposits.map((line) => Number(line.total) || 0));
  if (copied == null) return lines;
  const keeper = deposits[0];
  return keeper ? [...services, keeper] : services;
}

function mergeDepositInvoices<T extends ProfitLossDepositLine>(buckets: Map<string, T[]>): void {
  const groupIds = new Set(
    [...buckets.keys()].filter((key) => key.startsWith('g:')).map((key) => key.slice(2)),
  );
  for (const [key, lines] of [...buckets.entries()]) {
    if (!key.startsWith('i:')) continue;
    const id = key.slice(2);
    if (!id || !groupIds.has(id) || !isDepositOnlyInvoice(lines)) continue;
    const hostKey = `g:${id}`;
    const host = buckets.get(hostKey);
    if (!host) continue;
    if (!(Math.abs(depositPoolOf(host)) > 0.004)) host.push(...lines);
    buckets.delete(key);
  }
}

/**
 * Kar-zarar satır hesabı.
 * Depozito satırı dönmez. Net satış, pay dağıtıldıktan sonraki hizmet tutarıdır.
 * SMM depozito satırından gelmez.
 */
export function foldProfitLossLines<T extends ProfitLossDepositLine>(lines: T[]): T[] {
  const prepared = (lines || []).map((line) =>
    isDepositProductLine(line) ? { ...line, cost: 0 } : { ...line },
  );
  const buckets = new Map<string, T[]>();
  for (const line of prepared) {
    const key = groupKey(line);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(line);
    else buckets.set(key, [line]);
  }
  mergeDepositInvoices(buckets);

  const out: T[] = [];
  for (const group of buckets.values()) {
    const collapsed = collapseCopiedDepositLines(group);
    const productLines = collapsed.filter((line) => isExplicitProfitLossProductLine(line));
    // Ürün kendi netinde kalır. Hizmet kendi netinde kalır. Depozito satır olmaz
    // ve iki tutarın yerine randevu fiyatı yazılmaz.
    if (productLines.length > 0) {
      const servicesKept = collapsed.filter(
        (line) => !isExplicitProfitLossProductLine(line) && !isDepositProductLine(line),
      );
      out.push(...productLines, ...servicesKept);
      continue;
    }
    const services = collapsed.filter((line) => !isDepositProductLine(line));
    if (services.length === 0) continue;
    const pool = depositPoolOf(collapsed);
    const serviceSum = serviceMoneySum(collapsed);
    const remainder = remainderOf(collapsed);
    let header = headerNetOf(collapsed);
    // Depozito satırı kasa tahsilatıdır. Birden fazla hizmetin kendi tutarı
    // zaten cirodur; kalan yazılmamışsa başlık depozitoyu da içerse ikinci
    // kez eklenmez (50.000 + 60.000 = 110.000, 130.000 olmaz).
    if (
      services.length >= 2
      && collapsed.some((line) => isDepositProductLine(line))
      && !(Math.abs(remainder) > 0.004)
    ) {
      header = serviceSum;
    }
    const commercial = resolveProfitLossInvoiceNet(
      serviceSum,
      pool,
      header,
      remainder,
    );
    const fiche = moneyList(
      collapsed.find((line) => moneyList(line.ficheDeposits).length > 0)?.ficheDeposits,
    );
    const folded = foldDepositRevenueIntoServices(collapsed, {
      invoiceNet: commercial,
      ficheDeposits: fiche,
    });
    for (const line of folded) {
      if (isDepositProductLine(line)) continue;
      out.push(line);
    }
  }
  return out;
}

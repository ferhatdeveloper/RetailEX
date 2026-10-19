/**
 * Müşteri satış raporu: depozito hizmete dağıtılır, ciroya ikinci kez eklenmez.
 *
 * 35.000 hizmet + 15.000 depozito, fiş neti 50.000 → hizmet 50.000,
 * rezervasyon bilgisi 15.000, toplam ciro 50.000.
 * Hizmet zaten 50.000 ise 15.000 ikinci kez eklenmez.
 * Depozito satırı gizlenir; pay randevu düşümüyle aynıdır.
 */
import {
  foldDepositRevenueIntoServices,
  foldSaleItemsWithDeposits,
  isDepositProductLine,
  type FicheDepositRef,
} from './beautyDepositAllocation';

/** Aynı POS kaydından gelen kardeş randevular bu pencerede birlikte oluşur. */
const VISIT_WINDOW_MS = 3 * 60 * 1000;

export interface CustomerAppointmentInput {
  id: string;
  customerId: string;
  customerName?: string;
  customerCode?: string;
  phone?: string;
  date?: string;
  createdAt?: string | null;
  totalPrice: number;
  depositAmount: number;
  remainderPaid?: number;
  /** Kapanan randevuda deposit_amount sıfırlandıysa cari avans tutarı. */
  linkedAvans?: number;
  status?: string | null;
}

export interface CustomerSaleLineInput {
  productName?: string | null;
  productCode?: string | null;
  productId?: string | null;
  lineType?: string | null;
  item_type?: string | null;
  quantity?: number | null;
  total?: number | null;
  /** Hizmetin kendi depozitosu. Depozito satırı yoksa bu tutar kullanılır. */
  depositAmount?: number | null;
}

/**
 * Satış fişi yedeği. `items` varsa dağıtım `foldSaleItemsWithDeposits` ile yapılır.
 * Yalnız başlık varsa fiş / hizmet depozitosu aynı kurala girer.
 */
export interface CustomerSaleReceiptInput {
  id: string;
  customerId: string;
  customerName?: string;
  customerCode?: string;
  phone?: string;
  date?: string;
  /** Fiş neti. Hizmet satırları bu tutara eşitse depozito ikinci kez eklenmez. */
  total: number;
  /** Başlıkta hizmet tutarı ayrıysa (satır yok). Yoksa `total` hizmet tutarıdır. */
  serviceAmount?: number | null;
  /** Başlıktaki tek hizmet depozitosu. */
  serviceDeposit?: number | null;
  ficheDeposit?: number | null;
  ficheDeposits?: Array<number | null> | null;
  items?: CustomerSaleLineInput[] | null;
  /** Bilinen tahsilat. Boşsa tamamlanmış fişte hizmet tutarı kullanılır. */
  collected?: number | null;
  collectedKnown?: boolean;
  status?: string | null;
  isDeposit?: boolean | null;
  linkedAppointmentId?: string | null;
  saleGroupId?: string | null;
  depositSaleId?: string | null;
  parentSaleId?: string | null;
  depositRefs?: FicheDepositRef[] | null;
}

export interface CustomerSalesAggregate {
  customerId: string;
  customerName: string;
  customerCode: string;
  phone: string;
  salesCount: number;
  serviceRevenue: number;
  depositRevenue: number;
  totalRevenue: number;
  collectedAmount: number;
  avgSale: number;
  lastSaleDate: string;
}

const CANCELLED = new Set([
  'cancelled',
  'canceled',
  'refunded',
  'void',
  'silindi',
  'iptal',
  'deleted',
  'no_show',
]);

const COMPLETED = new Set([
  'completed',
  'complete',
  'done',
  'finished',
  'tamamlandi',
  'tamamlandı',
  'paid',
  'closed',
]);

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Hizmet tutarı depozitoyu içeriyorsa eklenmez.
 * Fiyat kalan tutarsa depozito bir kez eklenir.
 * Yalnız depozito kaldıysa ciro depozitodur.
 */
export function resolveCustomerServiceAmount(
  price: number,
  depositShare: number,
  remainderPaid: number,
): { service: number; depositInfo: number } {
  const p = Math.max(0, Number(price) || 0);
  const d = Math.max(0, Number(depositShare) || 0);
  const r = Math.max(0, Number(remainderPaid) || 0);
  const tol = Math.max(1, Math.abs(p) * 0.002);
  if (p <= 0.004 && d > 0.004) {
    return { service: round2(d), depositInfo: round2(d) };
  }
  if (d > 0.004 && Math.abs(r + d - p) <= tol) {
    return { service: round2(p), depositInfo: round2(d) };
  }
  if (d > 0.004 && p > 0.004 && r > 0.004 && Math.abs(r - p) <= tol && r + d > p + tol) {
    return { service: round2(p + d), depositInfo: round2(d) };
  }
  return { service: round2(p), depositInfo: round2(d) };
}

/** Aynı tutar her hizmete kopyalandıysa bir kez döner; işaret korunur. */
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

function fichePoolFromList(values: Array<number | null | undefined>): number {
  const list = values.map((n) => Number(n) || 0);
  const copied = sameCopiedAmount(list);
  if (copied != null) return copied;
  const present = list.filter((n) => Math.abs(n) > 0.004);
  if (present.length === 0) return 0;
  return round2(present.reduce((sum, n) => sum + n, 0));
}

function createdMs(row: CustomerAppointmentInput): number | null {
  const raw = String(row.createdAt || '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Depozito satırı kazanır; sonra hizmetin kendi depozitosu; sonra fiş depozitosu.
 * Aynı tutar her hizmete kopyalandıysa bir kez sayılır.
 */
function depositInfoOf(
  items: CustomerSaleLineInput[],
  ficheDeposits: Array<number | null | undefined>,
  refs: FicheDepositRef[],
): number {
  let lineDeposit = 0;
  const services: CustomerSaleLineInput[] = [];
  for (const item of items) {
    if (isDepositProductLine(item)) {
      lineDeposit += Number(item.total) || 0;
      continue;
    }
    services.push(item);
  }
  if (Math.abs(lineDeposit) > 0.004) return round2(lineDeposit);
  if (services.length === 0) return fichePoolFromList(ficheDeposits);

  const used = new Set<string>();
  const owns = services.map((item) => {
    const preset = Number(item.depositAmount) || 0;
    if (Math.abs(preset) > 0.004) return preset;
    const name = String(item.productName || '').trim().toLocaleLowerCase('tr');
    if (!name) return 0;
    const hit = refs.find((ref) => {
      if (used.has(ref.id)) return false;
      const serviceName = String(ref.serviceName || '').trim().toLocaleLowerCase('tr');
      return !!serviceName && serviceName === name;
    });
    if (!hit) return 0;
    used.add(hit.id);
    return Number(hit.deposit) || 0;
  });
  if (owns.some((n) => Math.abs(n) > 0.004)) {
    const every = owns.every((n) => Math.abs(n) > 0.004);
    const copied = every ? sameCopiedAmount(owns) : null;
    if (copied != null) return copied;
    return round2(owns.reduce((sum, n) => sum + n, 0));
  }
  const unmatched = refs.filter((ref) => !used.has(ref.id)).map((ref) => Number(ref.deposit) || 0);
  return fichePoolFromList([...ficheDeposits, ...unmatched]);
}

function lineDepositOf(row: CustomerAppointmentInput): number {
  const raw =
    Math.abs(Number(row.depositAmount) || 0) > 0.004
      ? Number(row.depositAmount) || 0
      : Number(row.linkedAvans) || 0;
  if (Math.abs(raw) <= 0.004) return 0;
  const price = Number(row.totalPrice) || 0;
  if (price < 0 && raw > 0) return -Math.abs(raw);
  return raw;
}

/**
 * Kalan + depozito fiyata eşitse fiyat brüttür.
 * Kalan fiyata eşitse fiyat, depozito düşülmüş hizmettir; fiş neti ikisinin toplamıdır.
 */
function inferVisitNet(serviceSum: number, pool: number, remainderSum: number): number {
  if (Math.abs(pool) <= 0.004) return serviceSum;
  const tol = Math.max(1, Math.abs(serviceSum) * 0.002, Math.abs(pool) * 0.002);
  if (Math.abs(remainderSum + pool - serviceSum) <= tol) return serviceSum;
  if (Math.abs(remainderSum) > 0.004 && Math.abs(remainderSum - serviceSum) <= tol) {
    return round2(serviceSum + pool);
  }
  return serviceSum;
}

function emptyAggregate(id: string): CustomerSalesAggregate {
  return {
    customerId: id,
    customerName: '',
    customerCode: '',
    phone: '',
    salesCount: 0,
    serviceRevenue: 0,
    depositRevenue: 0,
    totalRevenue: 0,
    collectedAmount: 0,
    avgSale: 0,
    lastSaleDate: '',
  };
}

function finishAggregates(byCustomer: Map<string, CustomerSalesAggregate>): CustomerSalesAggregate[] {
  return Array.from(byCustomer.values())
    .map((row) => ({
      ...row,
      totalRevenue: row.serviceRevenue,
      avgSale: row.salesCount > 0 ? round2(row.totalRevenue / row.salesCount) : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue || a.customerName.localeCompare(b.customerName, 'tr'));
}

function touchCustomer(
  byCustomer: Map<string, CustomerSalesAggregate>,
  identity: {
    customerId: string;
    customerName?: string;
    customerCode?: string;
    phone?: string;
    date?: string;
  },
  priced: { service: number; depositInfo: number; collected: number; salesCount: number },
): void {
  const id = String(identity.customerId);
  const cur = byCustomer.get(id) || emptyAggregate(id);
  if (!cur.customerName && identity.customerName) cur.customerName = String(identity.customerName).trim();
  if (!cur.customerCode && identity.customerCode) cur.customerCode = String(identity.customerCode).trim();
  if (!cur.phone && identity.phone) cur.phone = String(identity.phone).trim();
  cur.salesCount += priced.salesCount;
  cur.serviceRevenue = round2(cur.serviceRevenue + priced.service);
  cur.depositRevenue = round2(cur.depositRevenue + priced.depositInfo);
  cur.totalRevenue = cur.serviceRevenue;
  cur.collectedAmount = round2(cur.collectedAmount + priced.collected);
  const date = String(identity.date || '').slice(0, 10);
  if (date && date > cur.lastSaleDate) cur.lastSaleDate = date;
  byCustomer.set(id, cur);
}

function groupAppointments(rows: CustomerAppointmentInput[]): CustomerAppointmentInput[][] {
  const used = new Set<string>();
  const groups: CustomerAppointmentInput[][] = [];
  const withTime = rows
    .filter((row) => createdMs(row) != null)
    .sort((a, b) => (createdMs(a)! - createdMs(b)!) || a.id.localeCompare(b.id));

  for (const row of withTime) {
    if (used.has(row.id)) continue;
    const anchor = createdMs(row)!;
    const customerId = String(row.customerId);
    const date = String(row.date || '').slice(0, 10);
    const group = withTime.filter((other) => {
      if (used.has(other.id)) return false;
      if (String(other.customerId) !== customerId) return false;
      if (String(other.date || '').slice(0, 10) !== date) return false;
      return Math.abs((createdMs(other) ?? 0) - anchor) <= VISIT_WINDOW_MS;
    });
    for (const item of group) used.add(item.id);
    groups.push(group);
  }
  for (const row of rows) {
    if (used.has(row.id)) continue;
    used.add(row.id);
    groups.push([row]);
  }
  return groups;
}

function priceAppointmentVisit(group: CustomerAppointmentInput[]): {
  service: number;
  depositInfo: number;
  collected: number;
  salesCount: number;
} {
  const lines: CustomerSaleLineInput[] = group.map((row) => ({
    productName: 'Hizmet',
    quantity: 1,
    total: Number(row.totalPrice) || 0,
    depositAmount: lineDepositOf(row),
  }));
  const serviceSum = round2(lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0));
  const pool = depositInfoOf(lines, [], []);
  const remainderSum = round2(group.reduce((sum, row) => sum + (Number(row.remainderPaid) || 0), 0));
  let service = serviceSum;
  let salesCount = 0;
  if (Math.abs(serviceSum) <= 0.004 && Math.abs(pool) > 0.004) {
    service = round2(pool);
    if (service > 0.004) salesCount = 1;
  } else {
    const invoiceNet = inferVisitNet(serviceSum, pool, remainderSum);
    const folded = foldDepositRevenueIntoServices(lines, { invoiceNet });
    service = round2(folded.reduce((sum, line) => sum + (Number(line.total) || 0), 0));
    salesCount = folded.filter((line) => (Number(line.total) || 0) > 0.004).length;
  }
  let collected = round2(Math.abs(remainderSum) + Math.abs(pool));
  const completed = group.some((row) => COMPLETED.has(String(row.status || '').trim().toLowerCase()));
  if (collected <= 0.004 && Math.abs(pool) <= 0.004 && completed) collected = Math.abs(service);
  collected = Math.min(Math.abs(service), collected);
  return { service, depositInfo: pool, collected, salesCount };
}

export function aggregateCustomerAppointmentSales(
  rows: CustomerAppointmentInput[],
): CustomerSalesAggregate[] {
  const usable = (rows || []).filter((row) => {
    if (!String(row.customerId || '').trim() || !String(row.id || '').trim()) return false;
    const status = String(row.status || '').trim().toLowerCase();
    const money =
      Math.abs(Number(row.totalPrice) || 0) +
      Math.abs(Number(row.depositAmount) || 0) +
      Math.abs(Number(row.linkedAvans) || 0);
    if (CANCELLED.has(status) && money <= 0.004) return false;
    return true;
  });

  const byCustomer = new Map<string, CustomerSalesAggregate>();
  for (const group of groupAppointments(usable)) {
    const priced = priceAppointmentVisit(group);
    const head = group.find((row) => String(row.customerName || '').trim()) || group[0];
    const lastDate = group.reduce((max, row) => {
      const date = String(row.date || '').slice(0, 10);
      return date > max ? date : max;
    }, '');
    touchCustomer(byCustomer, {
      customerId: head.customerId,
      customerName: head.customerName,
      customerCode: head.customerCode,
      phone: head.phone,
      date: lastDate,
    }, priced);
  }
  return finishAggregates(byCustomer);
}

function receiptMoney(sale: CustomerSaleReceiptInput): number {
  const items = sale.items || [];
  const line = items.reduce((sum, item) => sum + Math.abs(Number(item.total) || 0), 0);
  return Math.abs(Number(sale.total) || 0) + Math.abs(Number(sale.ficheDeposit) || 0) + line;
}

function isDepositOnlyReceipt(sale: CustomerSaleReceiptInput): boolean {
  const items = sale.items || [];
  if (items.length > 0) return items.every((item) => isDepositProductLine(item));
  return sale.isDeposit === true;
}

function depositReceiptAmount(sale: CustomerSaleReceiptInput): number {
  const items = sale.items || [];
  const line = items
    .filter((item) => isDepositProductLine(item))
    .reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  if (Math.abs(line) > 0.004) return round2(line);
  if (sale.ficheDeposit != null && Math.abs(Number(sale.ficheDeposit) || 0) > 0.004) {
    return round2(Number(sale.ficheDeposit) || 0);
  }
  return round2(Number(sale.total) || 0);
}

function findServiceHost(
  deposit: CustomerSaleReceiptInput,
  services: CustomerSaleReceiptInput[],
): CustomerSaleReceiptInput | undefined {
  const same = (sale: CustomerSaleReceiptInput) => String(sale.customerId) === String(deposit.customerId);
  return (
    services.find((sale) => same(sale) && deposit.parentSaleId && deposit.parentSaleId === sale.id) ||
    services.find((sale) => same(sale) && sale.depositSaleId && sale.depositSaleId === deposit.id) ||
    services.find((sale) => same(sale) && deposit.saleGroupId && deposit.saleGroupId === sale.saleGroupId) ||
    services.find(
      (sale) =>
        same(sale) &&
        deposit.linkedAppointmentId &&
        deposit.linkedAppointmentId === sale.linkedAppointmentId,
    )
  );
}

function headerFicheList(sale: CustomerSaleReceiptInput, extra: number[]): number[] {
  const list: number[] = [];
  if (sale.ficheDeposit != null && Math.abs(Number(sale.ficheDeposit) || 0) > 0.004) {
    list.push(Number(sale.ficheDeposit) || 0);
  }
  for (const value of sale.ficheDeposits || []) {
    if (Math.abs(Number(value) || 0) > 0.004) list.push(Number(value) || 0);
  }
  for (const value of extra) {
    if (Math.abs(value) > 0.004) list.push(value);
  }
  return list;
}

function priceServiceReceipt(
  sale: CustomerSaleReceiptInput,
  extraFiche: number[],
): { service: number; depositInfo: number } {
  const invoiceNet = Number(sale.total) || 0;
  const items = sale.items || [];
  const fiche = headerFicheList(sale, extraFiche);
  const hasServiceLine = items.some((item) => !isDepositProductLine(item));
  if (items.length > 0 && hasServiceLine) {
    const refs: FicheDepositRef[] = [
      ...(sale.depositRefs || []),
      ...fiche.map((deposit, index) => ({
        id: `fiche:${sale.id}:${index}`,
        deposit,
        remainderSaleId: sale.id,
      })),
    ];
    const folded = foldSaleItemsWithDeposits(
      items,
      {
        id: sale.id,
        total: invoiceNet,
        linkedAppointmentId: sale.linkedAppointmentId,
        saleGroupId: sale.saleGroupId,
      },
      refs,
    );
    const service = round2(folded.reduce((sum, line) => sum + (Number(line.total) || 0), 0));
    const depositInfo = depositInfoOf(items, fiche, sale.depositRefs || []);
    return { service, depositInfo };
  }

  const serviceAmount = sale.serviceAmount != null ? Number(sale.serviceAmount) : invoiceNet;
  const headerLine: CustomerSaleLineInput[] = [
    {
      productName: 'Hizmet',
      quantity: 1,
      total: serviceAmount,
      depositAmount: sale.serviceDeposit ?? null,
    },
  ];
  const folded = foldDepositRevenueIntoServices(headerLine, {
    invoiceNet,
    ficheDeposits: fiche,
  });
  const service = round2(folded.reduce((sum, line) => sum + (Number(line.total) || 0), 0));
  const depositInfo = depositInfoOf(headerLine, fiche, []);
  return { service, depositInfo };
}

function collectedForReceipt(
  sale: CustomerSaleReceiptInput,
  extra: Array<{ known: boolean; amount: number }>,
  service: number,
): number {
  const parts = [
    {
      known: sale.collectedKnown === true || sale.collected != null,
      amount: Math.abs(Number(sale.collected) || 0),
    },
    ...extra.map((part) => ({ known: part.known, amount: Math.abs(part.amount) })),
  ];
  const known = parts.filter((part) => part.known);
  const cap = Math.abs(service);
  if (known.length > 0) {
    const sum = known.reduce((total, part) => total + part.amount, 0);
    return round2(Math.min(cap, sum));
  }
  const status = String(sale.status || '').trim().toLowerCase();
  if (COMPLETED.has(status)) return round2(cap);
  return 0;
}

/**
 * Satış fişi yedeği: depozito aynı fişin hizmetlerine yazılır.
 * DEPOSIT satırı ve yalnız depozito fişi müşteri cirosuna ayrı eklenmez.
 */
export function aggregateCustomerSaleReceipts(
  sales: CustomerSaleReceiptInput[],
): CustomerSalesAggregate[] {
  const usable = (sales || []).filter((sale) => {
    if (!String(sale.customerId || '').trim() || !String(sale.id || '').trim()) return false;
    const status = String(sale.status || '').trim().toLowerCase();
    if (CANCELLED.has(status) && receiptMoney(sale) <= 0.004) return false;
    return true;
  });
  const services = usable.filter((sale) => !isDepositOnlyReceipt(sale));
  const deposits = usable.filter((sale) => isDepositOnlyReceipt(sale));
  const extraFiche = new Map<string, number[]>();
  const extraCollected = new Map<string, Array<{ known: boolean; amount: number }>>();
  for (const deposit of deposits) {
    const host = findServiceHost(deposit, services);
    if (!host) continue;
    const bucket = extraFiche.get(host.id) || [];
    bucket.push(depositReceiptAmount(deposit));
    extraFiche.set(host.id, bucket);
    const collected = extraCollected.get(host.id) || [];
    collected.push({
      known: deposit.collectedKnown === true || deposit.collected != null,
      amount: Math.abs(Number(deposit.collected) || 0),
    });
    extraCollected.set(host.id, collected);
  }

  const byCustomer = new Map<string, CustomerSalesAggregate>();
  for (const sale of services) {
    const priced = priceServiceReceipt(sale, extraFiche.get(sale.id) || []);
    const collected = collectedForReceipt(sale, extraCollected.get(sale.id) || [], priced.service);
    const salesCount = Math.abs(priced.service) > 0.004 ? 1 : 0;
    touchCustomer(byCustomer, sale, {
      service: priced.service,
      depositInfo: priced.depositInfo,
      collected,
      salesCount,
    });
  }
  return finishAggregates(byCustomer);
}

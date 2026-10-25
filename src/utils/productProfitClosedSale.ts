/**
 * Ürün kârlılığı, genel bakış ve müşteri kârı satış tutarı.
 *
 * Satış, durumu kapandı / tamamlandı olan randevu faturasının tam tutarıdır.
 * Kapalı faturanın peşinatı bu tutardan düşülmez; eksikse bir kez eklenir.
 * Tutar zaten tamsa ikinci kez eklenmez.
 * Açık veya iptal randevunun peşinatı satışa girmez. İptal peşinatı iade değildir.
 * Malzeme iadesi kendi eksi satırından bir kez düşülür.
 * Maliyet bu fonksiyonda yeniden hesaplanmaz.
 */
import { isDepositProductLine } from './beautyDepositAllocation';
import { productGrossProfitMarginPct } from './productGrossProfitMargin';
import {
  foldProfitLossLines,
  type ProfitLossDepositLine,
} from './profitLossDeposit';

/** Hizmet henüz kapanmamış. Kapalı faturada peşinat yine satışta kalır. */
const OPEN_APPOINTMENT = new Set([
  'scheduled',
  'confirmed',
  'pre_paid',
  'in_progress',
  'pending',
  'awaiting_service',
]);

/** İptal, no-show, silinmiş. Peşinat satışa girmez; iade de sayılmaz. */
const CANCELLED_APPOINTMENT = new Set([
  'cancelled',
  'canceled',
  'iptal',
  'no_show',
  'noshow',
  'gelmedi',
  'refunded',
  'void',
  'deleted',
  'silindi',
]);

export interface ProductProfitSaleLine extends ProfitLossDepositLine {
  /** Randevu durumu. Boşsa peşinat kar-zarar katlamasına bırakılır. */
  appointmentStatus?: string | null;
  /**
   * Fatura kapandı / tamamlandı.
   * Randevu alanı hâlâ açık görünebilir; peşinat bu faturanın satışından düşülmez.
   */
  invoiceClosed?: boolean | null;
}

export interface ProfitAppointmentMoney {
  id?: string | null;
  status?: string | null;
  deposit_amount?: number | null;
  remainder_paid_amount?: number | null;
  service_name?: string | null;
  remainder_sale_id?: string | null;
  deposit_sale_id?: string | null;
  sale_group_id?: string | null;
}

function appointmentWord(status: unknown): string {
  return String(status ?? '').trim().toLocaleLowerCase('tr-TR');
}

/**
 * Peşinat satış cirosuna girer mi?
 * Kapalı / tamamlanmış randevu girer. Durum yazılmamışsa girer.
 * Açık ve iptal randevu, kapalı fatura değilse girmez.
 */
export function profitDepositEntersSales(status: unknown): boolean {
  const text = appointmentWord(status);
  if (!text) return true;
  if (CANCELLED_APPOINTMENT.has(text)) return false;
  if (OPEN_APPOINTMENT.has(text)) return false;
  return true;
}

function stripOpenDeposit<T extends ProductProfitSaleLine>(line: T): T | null {
  const text = appointmentWord(line.appointmentStatus);
  if (CANCELLED_APPOINTMENT.has(text)) {
    if (isDepositProductLine(line)) return null;
    return {
      ...line,
      depositAmount: 0,
      ficheDeposits: [],
      ficheRemainders: [],
    };
  }
  if (!text || !OPEN_APPOINTMENT.has(text)) return line;
  if (isDepositProductLine(line)) return null;
  // Kapalı fatura: peşinat payı satıştan düşülmez.
  if (line.invoiceClosed) return line;
  return {
    ...line,
    depositAmount: 0,
    ficheDeposits: [],
    ficheRemainders: [],
  };
}

/**
 * Kapalı randevu faturasının net satışı.
 * Kar-zarar katlamasını kullanır; açık ve iptal peşinatını önce ayırır.
 */
export function foldProductProfitSaleLines<T extends ProductProfitSaleLine>(lines: T[]): T[] {
  const prepared: T[] = [];
  for (const line of lines || []) {
    const next = stripOpenDeposit(line);
    if (next) prepared.push(next);
  }
  return foldProfitLossLines(prepared);
}

function appointmentMatchesSale(
  appt: ProfitAppointmentMoney,
  sale: {
    id?: string | null;
    linkedAppointmentId?: string | null;
    saleGroupId?: string | null;
  },
): boolean {
  const saleId = String(sale.id || '').trim();
  const group = String(sale.saleGroupId || '').trim();
  const linked = String(sale.linkedAppointmentId || '').trim();
  const id = String(appt.id || '').trim();
  if (linked && id === linked) return true;
  const remainderSale = String(appt.remainder_sale_id || '').trim();
  const depositSale = String(appt.deposit_sale_id || '').trim();
  if (saleId && (remainderSale === saleId || depositSale === saleId)) return true;
  const apptGroup = String(appt.sale_group_id || '').trim();
  return !!(group && apptGroup && apptGroup === group);
}

/**
 * REST satırlarına randevu peşinatını ve kalanını yazar, sonra katar.
 * İptal peşinatı havuza girmez.
 * Kapalı faturada randevu alanı henüz açık görünse de peşinat bir kez yazılır.
 * Açık fatura peşinatı yazılmaz.
 */
export function foldRestProfitInvoice<T extends ProductProfitSaleLine>(
  items: T[],
  sale: {
    id?: string | null;
    total?: number | null;
    linkedAppointmentId?: string | null;
    saleGroupId?: string | null;
  },
  appointments: ProfitAppointmentMoney[] | null | undefined,
): T[] {
  const saleId = String(sale.id || '').trim();
  const invoiceNet = Number(sale.total) || 0;
  const sign = invoiceNet < 0 ? -1 : 1;
  const matched = (appointments || []).filter((appt) => appointmentMatchesSale(appt, sale));
  const invoiceClosed = (items || []).some((item) => item.invoiceClosed === true);
  const closed = matched.filter((appt) => {
    const text = appointmentWord(appt.status);
    if (CANCELLED_APPOINTMENT.has(text)) return false;
    if (profitDepositEntersSales(appt.status)) return true;
    return invoiceClosed;
  });
  const used = new Set<string>();
  const withOwn = (items || []).map((item) => {
    if (isDepositProductLine(item)) return item;
    const name = String(item.productName || '').trim().toLocaleLowerCase('tr-TR');
    if (!name) return item;
    const hit = closed.find((appt) => {
      const id = String(appt.id || '');
      if (!id || used.has(id)) return false;
      const serviceName = String(appt.service_name || '').trim().toLocaleLowerCase('tr-TR');
      return !!serviceName && serviceName === name;
    });
    if (!hit) return item;
    used.add(String(hit.id || ''));
    return {
      ...item,
      depositAmount: sign * Math.abs(Number(hit.deposit_amount) || 0),
      appointmentStatus: hit.status ?? item.appointmentStatus ?? null,
    };
  });
  const unmatched = closed.filter((appt) => !used.has(String(appt.id || '')));
  const ficheDeposits = unmatched
    .map((appt) => sign * Math.abs(Number(appt.deposit_amount) || 0))
    .filter((n) => Math.abs(n) > 0.004);
  const ficheRemainders = closed
    .map((appt) => sign * Math.abs(Number(appt.remainder_paid_amount) || 0))
    .filter((n) => Math.abs(n) > 0.004);
  const tagged = withOwn.map((item) => ({
    ...item,
    invoiceId: item.invoiceId || saleId,
    invoiceNet: item.invoiceNet != null ? item.invoiceNet : invoiceNet,
    ficheDeposits: ficheDeposits,
    ficheRemainders,
  }));
  return foldProductProfitSaleLines(tagged);
}

export interface ProfitDashboardTotals {
  /** Net satış. Kapalı fatura tutarı, peşinat bir kez. */
  revenue: number;
  /** SMM. Bu fonksiyon maliyeti yeniden hesaplamaz. */
  cost: number;
  /** Net satış − SMM. */
  profit: number;
  /** Kâr / net satış, iki ondalık. */
  margin: number;
  productCount: number;
  topProduct: string | null;
  byName: Map<string, { revenue: number; cost: number; profit: number }>;
}

/**
 * Karlılık Analizi genel bakış toplamı.
 * Satırları kar-zarar katlamasından geçirir; ikinci bir satış formülü yoktur.
 */
export function summarizeProfitDashboard(lines: ProductProfitSaleLine[]): ProfitDashboardTotals {
  const folded = foldProductProfitSaleLines(lines);
  const byName = new Map<string, { revenue: number; cost: number; profit: number }>();
  for (const line of folded) {
    const name = String(line.productName || '').trim();
    if (!name) continue;
    const cur = byName.get(name) || { revenue: 0, cost: 0, profit: 0 };
    cur.revenue += Number(line.total) || 0;
    cur.cost += Number(line.cost) || 0;
    cur.profit = cur.revenue - cur.cost;
    byName.set(name, cur);
  }
  let revenue = 0;
  let cost = 0;
  let topProduct: string | null = null;
  let topProfit = -Infinity;
  for (const [name, row] of byName) {
    revenue += row.revenue;
    cost += row.cost;
    if (row.profit > topProfit) {
      topProfit = row.profit;
      topProduct = name;
    }
  }
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    margin: productGrossProfitMarginPct(revenue, profit),
    productCount: byName.size,
    topProduct,
    byName,
  };
}

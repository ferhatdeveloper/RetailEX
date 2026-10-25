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
import {
  foldProfitLossLines,
  type ProfitLossDepositLine,
} from './profitLossDeposit';

const OPEN_OR_CANCELLED_APPOINTMENT = new Set([
  'scheduled',
  'confirmed',
  'pre_paid',
  'in_progress',
  'pending',
  'awaiting_service',
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

/**
 * Peşinat satış cirosuna girer mi?
 * Kapalı / tamamlanmış randevu girer. Durum yazılmamışsa girer.
 * Açık ve iptal randevu girmez.
 */
export function profitDepositEntersSales(status: unknown): boolean {
  const text = String(status ?? '').trim().toLocaleLowerCase('tr-TR');
  if (!text) return true;
  return !OPEN_OR_CANCELLED_APPOINTMENT.has(text);
}

function stripOpenDeposit<T extends ProductProfitSaleLine>(line: T): T | null {
  if (profitDepositEntersSales(line.appointmentStatus)) return line;
  if (isDepositProductLine(line)) return null;
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
 * REST satırlarına kapalı randevu peşinatını ve kalanını yazar, sonra katar.
 * Açık ve iptal randevunun peşinatı havuza girmez.
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
  const closed = matched.filter((appt) => profitDepositEntersSales(appt.status));
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

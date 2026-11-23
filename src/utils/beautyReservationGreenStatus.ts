import { AppointmentStatus } from '../types/beauty';

/**
 * Takvim yeşili `status = completed` okur (kuyruk, personel şeridi, hafta kartı).
 * Peşinat ve kısmi tahsilat yeşil yapmaz. İptal ve gelmedi değişmez.
 */
export const GREEN_RESERVATION_STATUS = AppointmentStatus.COMPLETED;

const BLOCKED_STATUS = new Set([
  'cancelled',
  'canceled',
  'no_show',
  'noshow',
  'no-show',
  'void',
  'deleted',
]);

const ALREADY_GREEN = new Set(['completed', 'closed']);

export interface ReservationGreenRow {
  id: string;
  status?: string | null;
  saleGroupId?: string | null;
  customerId?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  serviceId?: string | null;
  depositAmount?: number | null;
}

export interface ServiceSalePaymentRow {
  isDeposit?: boolean | null;
  cancelled?: boolean | null;
  paidAmount?: number | null;
  total?: number | null;
  remainingAmount?: number | null;
  paymentStatus?: string | null;
  notes?: string | null;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function statusKey(value: unknown): string {
  return text(value).toLowerCase();
}

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function dateKey(value: unknown): string {
  const match = text(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function timeKey(value: unknown): string {
  const match = text(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** Hizmet fişi ziyareti kapatır ve kalanı da kapatır. Peşinat fişi ve kısmi tahsilat sayılmaz. */
export function serviceSaleFullyPaysVisit(sale: ServiceSalePaymentRow): boolean {
  if (sale.isDeposit === true || sale.cancelled === true) return false;
  const notes = text(sale.notes);
  if (/deposit:1(?:\||$)/i.test(notes)) return false;
  const paymentStatus = statusKey(sale.paymentStatus);
  if (paymentStatus === 'cancelled' || paymentStatus === 'canceled' || paymentStatus === 'void' || paymentStatus === 'refunded') {
    return false;
  }
  if (paymentStatus !== 'paid' && paymentStatus !== 'completed' && paymentStatus !== 'closed') return false;
  if (sale.remainingAmount != null && Math.abs(money(sale.remainingAmount)) > 0.004) return false;
  const paid = Math.abs(money(sale.paidAmount));
  const total = Math.abs(money(sale.total));
  if (!(paid > 0.004)) return false;
  if (total > 0.004 && paid + 0.004 < total) return false;
  return true;
}

/**
 * Ödenmiş ve tamamlanmış ziyaretin yeşil durumu.
 * Ödenmemiş, tamamlanmamış, iptal ve gelmedi için durum değişmez.
 */
export function greenStatusAfterPayment(input: {
  fullyPaid: boolean;
  visitCompleted: boolean;
  currentStatus?: string | null;
}): AppointmentStatus | null {
  if (!input.fullyPaid || !input.visitCompleted) return null;
  const current = statusKey(input.currentStatus);
  if (BLOCKED_STATUS.has(current)) return null;
  if (ALREADY_GREEN.has(current)) return null;
  return GREEN_RESERVATION_STATUS;
}

function depositReservation(row: ReservationGreenRow): boolean {
  if (statusKey(row.status) === 'pre_paid') return true;
  return money(row.depositAmount) > 0.004;
}

/**
 * Tahsilatı kapanmış ziyaretin bağlı rezervasyonları.
 * Satış fişi tek randevu id'sine yazılsa da aynı grup, aynı saat dilimi
 * ve peşinat satırı yeşil duruma gelir. Gelecek tarih engel değildir.
 * Gruptaki ödenmemiş başka hizmet yeşil olmaz.
 */
export function linkedReservationIdsForGreenStatus(input: {
  fullyPaid: boolean;
  visitCompleted: boolean;
  anchor: ReservationGreenRow;
  reservations: readonly ReservationGreenRow[];
  paidServiceIds?: readonly string[];
}): string[] {
  if (!input.fullyPaid || !input.visitCompleted) return [];
  const anchorId = text(input.anchor.id);
  if (!anchorId) return [];
  const group = text(input.anchor.saleGroupId);
  const anchorService = text(input.anchor.serviceId);
  const paidServices = new Set(
    (input.paidServiceIds ?? []).map((id) => text(id)).filter((id) => id.length > 0),
  );
  if (anchorService) paidServices.add(anchorService);
  const anchorCustomer = text(input.anchor.customerId);
  const anchorDate = dateKey(input.anchor.appointmentDate);
  const anchorTime = timeKey(input.anchor.appointmentTime);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of input.reservations) {
    const id = text(row.id);
    if (!id || seen.has(id)) continue;
    const next = greenStatusAfterPayment({
      fullyPaid: true,
      visitCompleted: true,
      currentStatus: row.status,
    });
    if (next == null) continue;
    const serviceId = text(row.serviceId);
    const sameGroup = group.length > 0 && text(row.saleGroupId) === group;
    const serviceOnSale = serviceId.length > 0 && paidServices.has(serviceId);
    const sameSlot =
      id !== anchorId
      && anchorCustomer.length > 0
      && anchorCustomer === text(row.customerId)
      && anchorDate.length > 0
      && anchorDate === dateKey(row.appointmentDate)
      && anchorTime.length > 0
      && anchorTime === timeKey(row.appointmentTime)
      && anchorService.length > 0
      && anchorService === serviceId;
    const linked =
      id === anchorId
      || sameSlot
      || (sameGroup && (serviceOnSale || depositReservation(row)));
    if (!linked) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

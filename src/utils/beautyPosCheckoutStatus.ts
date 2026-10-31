import { AppointmentStatus } from '../types/beauty';

/**
 * POS tahsilatı kapanınca randevu durumu.
 * Yalnız peşinat hizmeti kapatmaz. Gelecek tarih peşinatta planlı kalır.
 * Satış fişi yazılıp ödeme alındıysa randevu tarihi gelecekte olsa da tamamlanır.
 */
export function appointmentStatusAfterPosPayment(input: {
  appointmentDate: string;
  today: string;
  /** Peşinat. Hizmet satış fişi bu turda kapanmıyor. */
  prepaymentOnly: boolean;
}): AppointmentStatus {
  if (!input.prepaymentOnly) return AppointmentStatus.COMPLETED;
  const appointmentDate = String(input.appointmentDate || '').slice(0, 10);
  const today = String(input.today || '').slice(0, 10);
  const future = Boolean(appointmentDate && today && appointmentDate > today);
  return future ? AppointmentStatus.SCHEDULED : AppointmentStatus.PRE_PAID;
}

const TERMINAL_APPOINTMENT = new Set([
  'completed',
  'closed',
  'cancelled',
  'canceled',
  'no_show',
  'no-show',
  'void',
]);

export interface PostedServiceSaleRow {
  appointmentId?: string | null;
  isDeposit?: boolean | null;
  cancelled?: boolean | null;
  paidAmount?: number | null;
  total?: number | null;
  paymentStatus?: string | null;
  notes?: string | null;
}

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/** Hizmet satış fişi. Peşinat fişi randevuyu kapatmaz. */
export function postedServiceSaleClosesAppointment(sale: PostedServiceSaleRow): boolean {
  if (sale.isDeposit === true || sale.cancelled === true) return false;
  const notes = String(sale.notes ?? '');
  if (/deposit:1(?:\||$)/i.test(notes)) return false;
  const paymentStatus = String(sale.paymentStatus ?? '').trim().toLowerCase();
  if (paymentStatus === 'cancelled' || paymentStatus === 'canceled' || paymentStatus === 'void' || paymentStatus === 'refunded') {
    return false;
  }
  if (Math.abs(money(sale.paidAmount)) > 0.004) return true;
  const total = Math.abs(money(sale.total));
  return total > 0.004 && (paymentStatus === 'paid' || paymentStatus === 'completed' || paymentStatus === 'closed');
}

/**
 * Açık randevu, bağlı hizmet satış fişi varsa kapanır.
 * Peşinat fişi ve iptal fişi kapatmaz. Tamamlanmış kayıt tekrar yazılmaz.
 */
export function appointmentIdsClosedByServiceSale(
  appointments: ReadonlyArray<{ id?: string | null; status?: string | null }>,
  sales: ReadonlyArray<PostedServiceSaleRow>,
): string[] {
  const open = new Set<string>();
  for (const appointment of appointments) {
    const id = String(appointment.id ?? '').trim();
    if (!id) continue;
    const status = String(appointment.status ?? '').trim().toLowerCase();
    if (TERMINAL_APPOINTMENT.has(status)) continue;
    open.add(id);
  }
  const hit = new Set<string>();
  for (const sale of sales) {
    if (!postedServiceSaleClosesAppointment(sale)) continue;
    const id = String(sale.appointmentId ?? '').trim();
    if (open.has(id)) hit.add(id);
  }
  return [...hit];
}

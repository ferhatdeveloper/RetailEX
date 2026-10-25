/**
 * Rezervasyon kutusu, rezervasyon adedi ve rezervasyon tutarı kolonu.
 *
 * Yalnızca iptal edilmiş ve kapanmamış randevunun peşinatı girer.
 * Kapanmış / tamamlanmış randevunun peşinatı girmez.
 * Açık bekleyen (iptal değil) peşinat girmez.
 * Gelmedi iptal değildir; bu kutuya yazılmaz.
 *
 * Tutar bilgi kutusudur. Ciroya, iadeye, indirime, gidere ve nete yazılmaz.
 * Aynı randevunun peşinatı avans ve depozito kanallarında bir kez durur.
 */

import { isCancelledAppointmentStatus, appointmentIdFromAvansNotes } from './forfeitedReservationCash';
import { isCompletedAppointmentStatus } from './reportDepositFilter';

const EPS = 0.004;

export function isClosedCompletedAppointmentStatus(status: unknown): boolean {
  const text = String(status ?? '').trim().toLowerCase();
  if (text === 'closed') return true;
  return isCompletedAppointmentStatus(status);
}

/** İptal ayrı statüdür. Kapanmış veya gelmedi bu kümeye girmez. */
export function isCancelledUnclosedAppointmentStatus(status: unknown): boolean {
  if (isClosedCompletedAppointmentStatus(status)) return false;
  return isCancelledAppointmentStatus(status);
}

export interface CancelledReservationAppointment {
  id?: string | null;
  status?: string | null;
  deposit_amount?: number | string | null;
  depositAmount?: number | string | null;
  appointment_date?: string | null;
  appointmentDate?: string | null;
  date?: string | null;
}

export interface CancelledReservationAvansRow {
  amount?: number | string | null;
  notes?: string | null;
  status?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  appointmentId?: string | null;
  appointmentStatus?: string | null;
  applied_sale_id?: string | null;
  appliedSaleId?: string | null;
  refunded?: boolean | null;
}

export interface CancelledReservationDepositSale {
  total?: number | string | null;
  amount?: number | string | null;
  notes?: string | null;
  linkedAppointmentId?: string | null;
  linked_appointment_id?: string | null;
  appointmentStatus?: string | null;
  date?: string | null;
  created_at?: string | null;
  saleGroupId?: string | null;
  sale_group_id?: string | null;
}

export interface CancelledReservationBoxInput {
  appointments?: readonly CancelledReservationAppointment[] | null;
  avansRows?: readonly CancelledReservationAvansRow[] | null;
  depositSales?: readonly CancelledReservationDepositSale[] | null;
}

export interface CancelledReservationBox {
  amount: number;
  count: number;
}

interface ReservationSlot {
  amount: number;
  day: string;
}

function cleanId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function positiveAmount(value: unknown): number {
  const amount = Math.abs(Number(value) || 0);
  return amount > EPS ? amount : 0;
}

function dayKey(value: unknown): string {
  const day = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

function appointmentIdFromDepositNotes(notes: unknown): string {
  const text = String(notes ?? '');
  const rex = text.match(/rex_appt\s*[:=]\s*([0-9a-f-]{8,})/i);
  if (rex?.[1]) return rex[1];
  return appointmentIdFromAvansNotes(text);
}

function appointmentIdFromGroup(groupId: unknown): string {
  const match = String(groupId ?? '').match(/\bapt-([0-9a-f-]{8,})/i);
  return match?.[1] || '';
}

function collectCancelledUnclosedSlots(input: CancelledReservationBoxInput): ReservationSlot[] {
  const statusById = new Map<string, string>();
  const dayById = new Map<string, string>();
  const depositById = new Map<string, number>();

  for (const appointment of input.appointments || []) {
    const id = cleanId(appointment.id);
    if (!id) continue;
    statusById.set(id, String(appointment.status || ''));
    const day = dayKey(appointment.appointment_date || appointment.appointmentDate || appointment.date);
    if (day) dayById.set(id, day);
    const deposit = positiveAmount(appointment.deposit_amount ?? appointment.depositAmount);
    if (deposit > 0) depositById.set(id, deposit);
  }

  const chosen = new Map<string, ReservationSlot>();
  const orphans: ReservationSlot[] = [];

  const remember = (id: string, amount: number, day: string) => {
    if (!(amount > EPS)) return;
    const appointmentDay = dayById.get(id) || '';
    const slotDay = appointmentDay || day;
    const prev = chosen.get(id);
    if (!prev) {
      chosen.set(id, { amount, day: slotDay });
      return;
    }
    if (amount > prev.amount) prev.amount = amount;
    if (!prev.day && slotDay) prev.day = slotDay;
  };

  for (const row of input.avansRows || []) {
    if (row.refunded === true) continue;
    const avansStatus = String(row.status || '').trim().toLowerCase();
    if (avansStatus === 'refunded' || avansStatus === 'returned' || avansStatus === 'iade') continue;
    const id = cleanId(row.appointmentId) || cleanId(appointmentIdFromAvansNotes(row.notes));
    const status = String(row.appointmentStatus || (id ? statusById.get(id) : '') || '');
    const keptOnCancel = avansStatus === 'kept_on_cancel';
    if (status) {
      if (!isCancelledUnclosedAppointmentStatus(status)) continue;
    } else if (!keptOnCancel) {
      continue;
    } else if (isClosedCompletedAppointmentStatus(status)) {
      continue;
    }
    const amount = positiveAmount(row.amount);
    const day = dayKey(row.created_at || row.createdAt);
    if (id) remember(id, amount, day);
    else if (amount > 0) orphans.push({ amount, day });
  }

  for (const sale of input.depositSales || []) {
    const id = cleanId(sale.linkedAppointmentId || sale.linked_appointment_id)
      || cleanId(appointmentIdFromDepositNotes(sale.notes))
      || cleanId(appointmentIdFromGroup(sale.saleGroupId || sale.sale_group_id));
    if (!id) continue;
    const status = String(sale.appointmentStatus || statusById.get(id) || '');
    if (!isCancelledUnclosedAppointmentStatus(status)) continue;
    const amount = positiveAmount(sale.amount ?? sale.total);
    const day = dayKey(sale.date || sale.created_at);
    remember(id, amount, day);
  }

  for (const [id, amount] of depositById) {
    if (!isCancelledUnclosedAppointmentStatus(statusById.get(id))) continue;
    remember(id, amount, dayById.get(id) || '');
  }

  const slots: ReservationSlot[] = [];
  for (const slot of chosen.values()) {
    if (slot.amount > EPS) slots.push(slot);
  }
  for (const slot of orphans) {
    if (slot.amount > EPS) slots.push(slot);
  }
  return slots;
}

/** Dört yüzeyin ortak kutusu. Adet, tutarın ait olduğu randevu kümesidir. */
export function cancelledUnclosedReservationBox(
  input: CancelledReservationBoxInput,
): CancelledReservationBox {
  let amount = 0;
  let count = 0;
  for (const slot of collectCancelledUnclosedSlots(input)) {
    amount += slot.amount;
    count += 1;
  }
  return { amount, count };
}

/**
 * Aylık gün ve yıllık ay kolonları. Kutu ile aynı küme.
 * Gün anahtarı randevu tarihidir.
 */
export function cancelledUnclosedReservationByPeriod(
  input: CancelledReservationBoxInput,
  mode: 'monthly-days' | 'yearly-months',
): Map<string, CancelledReservationBox> {
  const map = new Map<string, CancelledReservationBox>();
  for (const slot of collectCancelledUnclosedSlots(input)) {
    if (!slot.day) continue;
    const key = mode === 'monthly-days' ? slot.day : slot.day.slice(0, 7);
    const current = map.get(key) || { amount: 0, count: 0 };
    current.amount += slot.amount;
    current.count += 1;
    map.set(key, current);
  }
  return map;
}

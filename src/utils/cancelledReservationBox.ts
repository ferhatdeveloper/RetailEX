/**
 * Rezervasyon kutusu, rezervasyon adedi ve rezervasyon tutarı kolonu.
 *
 * Kutuya girer:
 * - Kapanmamış randevunun peşinatı (bekliyor, ön ödeme alındı, onaylı, başladı).
 * - İptal edilmiş randevunun peşinatı. İade edilmez, cari alacak olmaz.
 *
 * Kutuya girmez:
 * - Kapanmış / tamamlanmış randevunun peşinatı. Tutar hizmet tahsilatının
 *   içindedir; ciroya ve nete ikinci kez yazılmaz.
 * - Gelmedi. İptal değildir.
 *
 * Aynı randevunun peşinatı avans ve depozito kanallarında bir kez durur.
 * Günlük satış detayında kapanmış randevunun avans satırı gizlenir.
 * Açık ve iptal satırı gerçek peşinat tutarıyla kalır.
 * Tahsilat kartı kapanmış satışın kasaya giren tutarıdır; açık ve iptal
 * peşinatı bu karta eklenmez.
 */

import { isCancelledAppointmentStatus, appointmentIdFromAvansNotes } from './forfeitedReservationCash';
import { isCompletedAppointmentStatus } from './reportDepositFilter';

const EPS = 0.004;

const EXCLUDED_RESERVATION_STATUSES = new Set([
  'no_show',
  'noshow',
  'gelmedi',
  'refunded',
  'returned',
  'iade',
  'void',
  'deleted',
  'silindi',
]);

export function isClosedCompletedAppointmentStatus(status: unknown): boolean {
  const text = String(status ?? '').trim().toLowerCase();
  if (text === 'closed') return true;
  return isCompletedAppointmentStatus(status);
}

/**
 * Peşinat rezervasyon kutusunda durur mu?
 * Kapanmamış veya iptal edilmiş randevu girer. Kapanmış ve gelmedi girmez.
 */
export function appointmentDepositStaysInReservationBox(status: unknown): boolean {
  if (isClosedCompletedAppointmentStatus(status)) return false;
  const text = String(status ?? '').trim().toLowerCase();
  if (!text) return false;
  if (EXCLUDED_RESERVATION_STATUSES.has(text)) return false;
  if (isCancelledAppointmentStatus(status)) return true;
  return true;
}

/** Eski ad. Kutu artık yalnız iptali değil, kapanmamış peşinatı da sayar. */
export function isCancelledUnclosedAppointmentStatus(status: unknown): boolean {
  return appointmentDepositStaysInReservationBox(status);
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
  /**
   * Rezervasyon özel kodu düşülmüş kasa tahsilatı.
   * Kapanmış randevunun peşinatı buna bir kez eklenir.
   * Açık ve iptal peşinatı eklenmez.
   */
  closedSaleCash?: number | string | null;
}

export interface CancelledReservationBox {
  amount: number;
  count: number;
}

interface ReservationSlot {
  amount: number;
  day: string;
}

type SlotMode = 'reservation-box' | 'closed-collection';

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

function normStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
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

function avansRefunded(row: CancelledReservationAvansRow): boolean {
  if (row.refunded === true) return true;
  const avansStatus = normStatus(row.status);
  return avansStatus === 'refunded' || avansStatus === 'returned' || avansStatus === 'iade';
}

function keepAvans(mode: SlotMode, appointmentStatus: string, avansStatus: string): boolean {
  if (mode === 'reservation-box') {
    if (appointmentStatus) return appointmentDepositStaysInReservationBox(appointmentStatus);
    return avansStatus === 'open' || avansStatus === 'kept_on_cancel';
  }
  if (appointmentStatus && appointmentDepositStaysInReservationBox(appointmentStatus)) return false;
  if (appointmentStatus && isClosedCompletedAppointmentStatus(appointmentStatus)) return true;
  return !appointmentStatus && avansStatus === 'applied';
}

function keepAppointmentDeposit(mode: SlotMode, appointmentStatus: string): boolean {
  if (mode === 'reservation-box') return appointmentDepositStaysInReservationBox(appointmentStatus);
  return isClosedCompletedAppointmentStatus(appointmentStatus);
}

function collectSlots(input: CancelledReservationBoxInput, mode: SlotMode): ReservationSlot[] {
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
    if (avansRefunded(row)) continue;
    const avansStatus = normStatus(row.status);
    const id = cleanId(row.appointmentId) || cleanId(appointmentIdFromAvansNotes(row.notes));
    const status = String(row.appointmentStatus || (id ? statusById.get(id) : '') || '');
    if (!keepAvans(mode, status, avansStatus)) continue;
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
    if (!keepAvans(mode, status, '')) continue;
    const amount = positiveAmount(sale.amount ?? sale.total);
    const day = dayKey(sale.date || sale.created_at);
    remember(id, amount, day);
  }

  for (const [id, amount] of depositById) {
    if (!keepAppointmentDeposit(mode, statusById.get(id) || '')) continue;
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

function sumSlots(slots: readonly ReservationSlot[]): CancelledReservationBox {
  let amount = 0;
  let count = 0;
  for (const slot of slots) {
    amount += slot.amount;
    count += 1;
  }
  return { amount, count };
}

/** Dört yüzeyin ortak kutusu. Adet, tutarın ait olduğu randevu kümesidir. */
export function cancelledUnclosedReservationBox(
  input: CancelledReservationBoxInput,
): CancelledReservationBox {
  return sumSlots(collectSlots(input, 'reservation-box'));
}

/**
 * Kapanmış randevunun peşinatı. Hizmet tahsilatının içindedir.
 * Aynı randevu bir kez. Açık ve iptal peşinat burada yoktur.
 */
export function closedAppointmentDepositInCollection(
  input: CancelledReservationBoxInput,
): number {
  return sumSlots(collectSlots(input, 'closed-collection')).amount;
}

/**
 * Klinik paneli tahsilat kartı.
 * `closedSaleCash` rezervasyon özel kodu düşülmüş kasa girişidir.
 * Kapanmış peşinat buna bir kez eklenir. Açık ve iptal peşinatı eklenmez.
 */
export function clinicPanelTahsilat(input: CancelledReservationBoxInput): number {
  const cash = Math.max(0, Number(input.closedSaleCash) || 0);
  return cash + closedAppointmentDepositInCollection(input);
}

/** Kapanmış randevunun avans satırı günlük listede durmaz. */
export function isClosedReservationAvansHidden(row: CancelledReservationAvansRow): boolean {
  if (avansRefunded(row)) return true;
  const avansStatus = normStatus(row.status);
  const appointmentStatus = String(row.appointmentStatus ?? '').trim();
  if (appointmentStatus && isClosedCompletedAppointmentStatus(appointmentStatus)) return true;
  if (avansStatus === 'applied' && !appointmentDepositStaysInReservationBox(appointmentStatus)) return true;
  return false;
}

/** Günlük satış detayı: kapanmış avans düşer, açık ve iptal kalır. */
export function dailyReservationAvansList<T extends CancelledReservationAvansRow>(
  rows: readonly T[] | null | undefined,
): T[] {
  const kept: T[] = [];
  for (const row of rows || []) {
    if (!isClosedReservationAvansHidden(row)) kept.push(row);
  }
  return kept;
}

/** Görünen avans satırının net tutarı. Gizli kapanmış satır 0'dır. */
export function dailyReservationAvansNet(row: CancelledReservationAvansRow): number {
  if (isClosedReservationAvansHidden(row)) return 0;
  return positiveAmount(row.amount);
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
  for (const slot of collectSlots(input, 'reservation-box')) {
    if (!slot.day) continue;
    const key = mode === 'monthly-days' ? slot.day : slot.day.slice(0, 7);
    const current = map.get(key) || { amount: 0, count: 0 };
    current.amount += slot.amount;
    current.count += 1;
    map.set(key, current);
  }
  return map;
}

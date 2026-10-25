/**
 * İptal edilmiş ve iade edilmemiş rezervasyon peşinatı.
 *
 * Hizmet cirosu değildir ve satış adedine yazılmaz.
 * Tamamlanan hizmete mahsup edilmiş peşinat burada yoktur; o tutar
 * hizmet tahsilatının içindedir ve nete ikinci kez girmez.
 * Açık randevunun peşinatı da burada yoktur; henüz vazgeçilmemiştir.
 * İade edilmiş peşinat kasadan çıkmıştır; nete girmez.
 *
 * Vazgeçilmiş peşinat müşteri alacağı, iade veya açık cari değildir.
 * Kasada kalan tutar net nakde / net kalana bir kez eklenir.
 */

export interface ForfeitedAvansInput {
  amount?: number | string | null;
  status?: string | null;
  notes?: string | null;
  appliedSaleId?: string | null;
  createdAt?: string | null;
  refunded?: boolean | null;
  appointmentStatus?: string | null;
}

export interface ForfeitedAppointmentInput {
  id?: string | null;
  status?: string | null;
  depositAmount?: number | string | null;
  appointmentDate?: string | null;
}

export type ForfeitedPeriodMode = 'monthly-days' | 'yearly-months';

const APPOINTMENT_NOTE = /Randevu No\s+([0-9a-f-]{8,})/i;
const EPS = 0.004;

function norm(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function isCancelledAppointmentStatus(status: unknown): boolean {
  const text = norm(status);
  return text === 'cancelled' || text === 'canceled' || text === 'iptal';
}

export function appointmentIdFromAvansNotes(notes: unknown): string {
  const match = String(notes ?? '').match(APPOINTMENT_NOTE);
  return match ? match[1] : '';
}

function positiveAmount(value: unknown): number {
  const amount = Math.abs(Number(value) || 0);
  return amount > EPS ? amount : 0;
}

/**
 * Tamamlanmış tahsilata bağlanmamış, iade edilmemiş iptal peşinatı.
 * `applied` ve tamamlanan randevuya mahsup edilen tutar 0 döner.
 */
export function isForfeitedUnrefundedDeposit(row: ForfeitedAvansInput): boolean {
  if (!(positiveAmount(row.amount) > 0)) return false;
  if (row.refunded === true) return false;
  const status = norm(row.status);
  if (status === 'refunded' || status === 'returned' || status === 'iade') return false;
  if (status === 'applied') return false;
  if (String(row.appliedSaleId || '').trim()) return false;
  if (norm(row.appointmentStatus) === 'completed') return false;
  if (status === 'kept_on_cancel') return true;
  return isCancelledAppointmentStatus(row.appointmentStatus);
}

export function forfeitedDepositAmount(row: ForfeitedAvansInput): number {
  if (!isForfeitedUnrefundedDeposit(row)) return 0;
  return positiveAmount(row.amount);
}

function periodKeyFromIso(iso: unknown, mode: ForfeitedPeriodMode): string {
  const day = String(iso ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  return mode === 'monthly-days' ? day : day.slice(0, 7);
}

/**
 * Gün veya ay kovası. Aynı randevunun avansı ve depozitosu bir kez yazılır.
 * Mahsup edilmiş peşinat kovaya girmez.
 */
export function forfeitedDepositByPeriod(
  avansRows: readonly ForfeitedAvansInput[] | null | undefined,
  appointments: readonly ForfeitedAppointmentInput[] | null | undefined,
  mode: ForfeitedPeriodMode,
): Map<string, number> {
  const statusById = new Map<string, string>();
  for (const appointment of appointments || []) {
    const id = String(appointment.id || '').trim();
    if (id) statusById.set(id, String(appointment.status || ''));
  }

  const map = new Map<string, number>();
  const countedAppointmentIds = new Set<string>();
  const add = (key: string, amount: number) => {
    if (!key || !(amount > EPS)) return;
    map.set(key, (map.get(key) || 0) + amount);
  };

  for (const row of avansRows || []) {
    const appointmentId = appointmentIdFromAvansNotes(row.notes);
    const appointmentStatus = row.appointmentStatus
      || (appointmentId ? statusById.get(appointmentId) : '')
      || '';
    const amount = forfeitedDepositAmount({ ...row, appointmentStatus });
    const status = norm(row.status);
    const settled = status === 'applied'
      || status === 'refunded'
      || status === 'returned'
      || status === 'iade'
      || row.refunded === true
      || Boolean(String(row.appliedSaleId || '').trim());
    if (appointmentId && (amount > 0 || settled)) countedAppointmentIds.add(appointmentId);
    if (!(amount > 0)) continue;
    add(periodKeyFromIso(row.createdAt, mode), amount);
  }

  for (const appointment of appointments || []) {
    const id = String(appointment.id || '').trim();
    if (id && countedAppointmentIds.has(id)) continue;
    if (!isCancelledAppointmentStatus(appointment.status)) continue;
    const amount = positiveAmount(appointment.depositAmount);
    if (!(amount > 0)) continue;
    add(periodKeyFromIso(appointment.appointmentDate, mode), amount);
  }

  return map;
}

export function sumForfeitedDepositMap(map: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const value of map.values()) total += Number(value) || 0;
  return total;
}

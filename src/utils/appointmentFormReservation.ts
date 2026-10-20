/**
 * Canlı randevu formu: hizmet bedeli ve rezervasyon tutarı.
 *
 * Depozito peşinattır. Hizmet satırının fiyatından düşülmez, sepet
 * toplamına eklenmez. Raporlardaki pay dağıtımı bu dosyada yapılmaz.
 */

export interface AppointmentMoneyLine {
  type?: string | null;
  name?: string | null;
  code?: string | null;
  itemId?: string | null;
  unitPrice: number;
  qty?: number | null;
}

const DEPOSIT_LINE_NAMES = new Set(['deposit', 'depozito', 'peşinat', 'pesinat', 'rezervasyon']);
const DEPOSIT_PREFIXES = ['deposit', 'depozito', 'deposıt', 'peşinat', 'pesinat'];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function isDepositToken(value: string | null | undefined): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const forms = [raw.toLocaleLowerCase('tr'), raw.toLowerCase()];
  return forms.some(
    (form) => DEPOSIT_LINE_NAMES.has(form) || DEPOSIT_PREFIXES.some((prefix) => form.startsWith(prefix)),
  );
}

/** DEPOSIT satırı hizmet değildir; sepette toplanmaz. */
export function isAppointmentDepositCartLine(line: {
  type?: string | null;
  name?: string | null;
  code?: string | null;
  itemId?: string | null;
}): boolean {
  return (
    isDepositToken(line.type) ||
    isDepositToken(line.name) ||
    isDepositToken(line.code) ||
    isDepositToken(line.itemId)
  );
}

/** Hizmet bedeli. Depozito satırı toplama girmez. */
export function appointmentServiceGross(lines: AppointmentMoneyLine[]): number {
  return round2(
    lines.reduce((sum, line) => {
      if (isAppointmentDepositCartLine(line)) return sum;
      const qty = Math.max(1, Number(line.qty) || 1);
      const price = Number(line.unitPrice) || 0;
      return sum + price * qty;
    }, 0),
  );
}

/** Ara toplam / toplam = hizmet bedeli − indirim. Depozito eklenmez. */
export function appointmentFormTotal(serviceGross: number, discountPercent: number): number {
  const gross = Math.max(0, Number(serviceGross) || 0);
  const pct = Math.max(0, Number(discountPercent) || 0);
  return round2(Math.max(0, gross - gross * (pct / 100)));
}

/**
 * Kayıtlı randevuda gösterilecek rezervasyon.
 * Aynı tutar her satıra kopyalandıysa bir kez sayılır.
 * Paylar farklıysa toplanır (13.000 + 7.000 = 20.000).
 * Avans kaynağı bu toplamdan büyükse kaynak gösterilir.
 * Kaynak da küçükse tutar uydurulmaz.
 */
export function resolveVisitReservationAmount(input: {
  storedDeposits?: Array<number | null | undefined>;
  sourceAmount?: number | null;
}): number {
  const list = (input.storedDeposits || [])
    .map((n) => Math.max(0, Number(n) || 0))
    .filter((n) => n > 0.004);
  let stored = 0;
  if (list.length > 0) {
    const keys = [...new Set(list.map((n) => n.toFixed(2)))];
    stored = keys.length === 1 ? Number(keys[0]) : round2(list.reduce((sum, n) => sum + n, 0));
  }
  const source = Math.max(0, Number(input.sourceAmount) || 0);
  if (source > stored + 0.004) return round2(source);
  return round2(stored);
}

/**
 * Rezervasyon alanı. Yeni randevuda kullanıcının yazdığı tutar kalır;
 * depozito satırı bu alanın yerine geçmez.
 */
export function appointmentReservationField(input: {
  existing: boolean;
  enteredAmount?: number | null;
  storedDeposits?: Array<number | null | undefined>;
  sourceAmount?: number | null;
}): number {
  if (!input.existing) return round2(Math.max(0, Number(input.enteredAmount) || 0));
  return resolveVisitReservationAmount(input);
}

/**
 * Hizmet kapanmadıysa kalan gösterilmez.
 * Kapandıysa kalan = hizmet bedeli − rezervasyon (bir kez).
 */
export function appointmentRemainingAfterDeposit(input: {
  serviceGross: number;
  discountPercent?: number;
  reservation: number;
  completed: boolean;
}): number | null {
  if (!input.completed) return null;
  const total = appointmentFormTotal(input.serviceGross, input.discountPercent ?? 0);
  const reservation = Math.max(0, Number(input.reservation) || 0);
  return round2(Math.max(0, total - reservation));
}

/**
 * Yeni kayıtta kullanıcı tutarı ilk randevuda durur.
 * Kardeş satıra yuvarlanmış pay yazılmaz; rapor payı kendi hesabında böler.
 */
export function depositAmountsForNewAppointments(reservation: number, lineCount: number): number[] {
  const count = Math.max(0, Math.floor(lineCount) || 0);
  const amount = round2(Math.max(0, Number(reservation) || 0));
  return Array.from({ length: count }, (_, idx) => (idx === 0 ? amount : 0));
}

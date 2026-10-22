/**
 * Canlı randevu formu: hizmet bedeli ve rezervasyon tutarı.
 *
 * Depozito peşinattır. Hizmet satırının fiyatından düşülmez, sepet
 * toplamına eklenmez. Tutar yazılınca hizmetlerin altında tek görsel
 * DEPOSIT satırı durur. Raporlardaki pay dağıtımı bu dosyada yapılmaz.
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

/**
 * Peşinat fiş no. Yeni randevuda kayıt yoktur; alan yokken fırlatmaz.
 * Boş metin yok sayılır.
 */
export function readAppointmentDepositFicheNo(
  appointment: { deposit_sale_fiche_no?: string | null } | null | undefined,
): string | null {
  const raw = appointment?.deposit_sale_fiche_no;
  if (raw == null) return null;
  const text = String(raw).trim();
  return text.length > 0 ? text : null;
}

/**
 * Rezervasyon tutarı yazılırken sayıya çevirir. Fırlatmaz.
 * Boş, yalnız ayraç ve sondaki ayraç ("1." / "1,") 0 veya önek tutardır.
 * IQD (0 hane): "20.000" ve "20,000" yirmi bindir; "1.5" en yakın tam sayıdır.
 * TRY (2 hane): "20,50" ve "20.50" yirmi buçuktur; "1.250,75" bin iki yüz ellidir.
 * Eksi ve harf 0 döner. Tutar peşinattır; bu fonksiyon ciroya eklemez.
 */
export function parseReservationAmountInput(raw: string, maxFractionDigits = 0): number {
  const digits = Number.isFinite(maxFractionDigits)
    ? Math.max(0, Math.min(6, Math.floor(maxFractionDigits)))
    : 0;
  let s = String(raw ?? '').trim().replace(/\s/g, '');
  s = s.replace(/[\u060C\u066B\uFF0C\u201A]/g, ',');
  if (!s || s === '-' || s === '+' || s === '.' || s === ',' || s === '-.' || s === '-,') return 0;
  if (/[.,]$/.test(s)) s = s.slice(0, -1);
  if (!s) return 0;
  if (/[^\d.,]/.test(s) || s.includes('-')) return 0;

  let normalized = s;
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = `${s.slice(0, lastComma).replace(/\./g, '').replace(/,/g, '')}.${s.slice(lastComma + 1).replace(/\D/g, '')}`;
    } else {
      normalized = `${s.slice(0, lastDot).replace(/,/g, '').replace(/\./g, '')}.${s.slice(lastDot + 1).replace(/\D/g, '')}`;
    }
  } else if (s.includes(',')) {
    if (digits === 0 || /^\d{1,3}(,\d{3})+$/.test(s)) {
      normalized = s.replace(/,/g, '');
    } else {
      const last = s.lastIndexOf(',');
      const intPart = s.slice(0, last).replace(/,/g, '');
      const frac = s.slice(last + 1).replace(/\D/g, '');
      normalized = frac.length > 0 ? `${intPart || '0'}.${frac}` : intPart;
    }
  } else if (s.includes('.')) {
    // "20.000" binlik. "0.500" ve "20.50" ondalık kalır; IQD sonra tam sayıya yuvarlanır.
    if (/^\d{1,3}(\.\d{3})+$/.test(s) && !s.startsWith('0.')) {
      normalized = s.replace(/\./g, '');
    } else {
      normalized = s;
    }
  }

  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return 0;
  if (digits === 0) return Math.round(num);
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
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
 * Randevu detayındaki kalan.
 * Peşinat varsa kalan = hizmet bedeli − rezervasyon, bir kez.
 * Hizmet kapanmamış olsa da aynı kalan gösterilir; kapanış ikinci kez düşmez.
 * Peşinat yok ve hizmet kapanmadıysa null döner; ekran "henüz gerçekleşmedi" der.
 * Peşinat yok ve hizmet kapandıysa kalan, indirimli hizmet bedelidir.
 */
export function appointmentRemainingAfterDeposit(input: {
  serviceGross: number;
  discountPercent?: number;
  reservation: number;
  completed: boolean;
}): number | null {
  const total = appointmentFormTotal(input.serviceGross, input.discountPercent ?? 0);
  const reservation = Math.max(0, Number(input.reservation) || 0);
  if (reservation <= 0.004) {
    if (!input.completed) return null;
    return total;
  }
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

/**
 * Yeni randevuda depozito kararı.
 * Hizmet fiyatı değişmez. Tutar fiyattan düşülmez, kardeş hizmete
 * bölünmez, ara toplama eklenmez. Kutu yalnızca fişi keser.
 * Tutar sıfırdan büyükse sepette tek görsel DEPOSIT satırı durur.
 */
export interface NewAppointmentDepositPlan {
  /** Hizmet birim fiyatları, girildiği gibi. */
  serviceUnitPrices: number[];
  serviceGross: number;
  /** Ara toplam / toplam. Depozito eklenmez ve düşülmez. */
  formTotal: number;
  /** Tek randevuda duran peşinat. */
  depositAmount: number;
  /** İlk randevu tam tutar, diğerleri 0. */
  depositByAppointment: number[];
  /** Tutar > 0 ve hizmet varsa sepette tek görsel satır. Toplama girmez. */
  includeDepositCartLine: boolean;
  /** Tutar > 0 ise cari avans yazılır. Kutu buna bağlı değildir. */
  recordCustomerAdvance: boolean;
  /** Kasaya girecek nakit. Hizmet bedeli değildir. */
  cashIn: number;
  /** Kutu işaretli ve tutar > 0 ise rezervasyon fişi kesilir. */
  cutReservationReceipt: boolean;
  /** Cariye hizmet borcu açılmaz. Depozito bakiyeyi borç gibi şişirmez. */
  customerServiceDebt: 0;
}

export function planNewAppointmentDeposit(input: {
  lines: AppointmentMoneyLine[];
  discountPercent?: number;
  reservationAmount: number;
  cutReceipt?: boolean;
}): NewAppointmentDepositPlan {
  const serviceLines = (input.lines || []).filter((line) => !isAppointmentDepositCartLine(line));
  const serviceUnitPrices = serviceLines.map((line) => round2(Number(line.unitPrice) || 0));
  const serviceGross = appointmentServiceGross(serviceLines);
  const formTotal = appointmentFormTotal(serviceGross, input.discountPercent ?? 0);
  const depositAmount = round2(Math.max(0, Number(input.reservationAmount) || 0));
  const recordCustomerAdvance = depositAmount > 0.004;
  return {
    serviceUnitPrices,
    serviceGross,
    formTotal,
    depositAmount,
    depositByAppointment: depositAmountsForNewAppointments(depositAmount, serviceLines.length),
    includeDepositCartLine: recordCustomerAdvance && serviceLines.length > 0,
    recordCustomerAdvance,
    cashIn: recordCustomerAdvance ? depositAmount : 0,
    cutReservationReceipt: recordCustomerAdvance && input.cutReceipt === true,
    customerServiceDebt: 0,
  };
}

/**
 * Rezervasyon tutarını sepete tek DEPOSIT satırı olarak yerleştirir.
 * Hizmet birim fiyatı aynı kalır. Tutar 0 ise satır kalkar.
 * Tutar değişince mevcut satırın tutarı güncellenir; ikinci satır açılmaz.
 * Rapor payı burada yazılmaz.
 */
export function syncAutomaticDepositCart<T extends AppointmentMoneyLine>(
  lines: T[],
  reservationAmount: number,
  createDeposit: (amount: number) => T,
): T[] {
  const services = lines.filter((line) => !isAppointmentDepositCartLine(line));
  const deposits = lines.filter((line) => isAppointmentDepositCartLine(line));
  const amount = round2(Math.max(0, Number(reservationAmount) || 0));
  if (amount <= 0.004 || services.length === 0) {
    return deposits.length === 0 ? lines : services;
  }
  const current = deposits.length === 1 ? deposits[0] : undefined;
  const price = Number(current?.unitPrice) || 0;
  const qty = Math.max(1, Number(current?.qty) || 1);
  const name = String(current?.name || '').trim();
  const code = String(current?.code || '').trim();
  const already =
    !!current &&
    Math.abs(price - amount) <= 0.004 &&
    qty === 1 &&
    name.toLowerCase() === 'deposit' &&
    (code === '' || code.toLowerCase() === 'deposit') &&
    lines[lines.length - 1] === current &&
    lines.length === services.length + 1;
  if (already) return lines;
  const deposit: T = current
    ? {
        ...current,
        type: 'deposit',
        name: 'DEPOSIT',
        code: 'DEPOSIT',
        itemId: current.itemId || 'DEPOSIT',
        unitPrice: amount,
        qty: 1,
      }
    : createDeposit(amount);
  return [...services, deposit];
}

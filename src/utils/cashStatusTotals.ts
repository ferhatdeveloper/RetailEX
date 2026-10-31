/**
 * Kasa Durumu — rezervasyon nakdi kasaya dahildir.
 *
 * Rezervasyon peşinatı çekmecedeki gerçek nakittir. Günlük nakit ve
 * kapanış bu tutarı bir kez içerir. Ödeme dağılımındaki ayrı rezervasyon
 * satırı bilgi amaçlıdır; genel toplama ikinci kez eklenmez.
 * Ciroya eklenmez (hizmet 50.000 ise +15.000 ciro yazılmaz).
 *
 * Genel toplam = nakit (rezervasyon dahil) + kart + açık cari + havale − gider.
 * Açık cari ödenmemiş satıştır. İskonto bu alana ve toplama yazılmaz;
 * nakit tutar iskontoyu zaten düşmüşse ikinci kez düşülmez.
 * Gider, klinik gideri ve kasa çıkış fişidir; nakit tahsilattan bir kez düşülür.
 * Kasa bakiyesi bu çıkıştan sonra net ise gider ikinci kez düşülmez.
 *
 * Açılış fişi (alacak) kasa çıkışıdır (işaret −1) ve nakitten bir kez düşer.
 * Açılış fişi (borç) kasa girişidir (işaret +1) ve nakde bir kez eklenir.
 * Aralık içindeki açılış fişi dönem hareketidir; açılış bakiyesine gizlenmez.
 * Açılış bakiyesi, seçili aralıktan önceki kasadır.
 * Satış faturasının tahsilatı günlük nakitteyse aynı fiş ikinci kez eklenmez.
 * Virman şirket nakdini değiştirmez. Peşinat ve indirim toplama eklenmez.
 *
 * Örnek: hizmet nakdi 35.000 + rezervasyon nakdi 15.000
 *   günlük nakit 50.000, kapanış 50.000, genel toplam 50.000 (65.000 değil).
 */

import {
  computeKasaIslemiSign,
  isKasaInvoiceIslemTipi,
  postedCashTypeForInvoiceIslem,
  type KasaIslemi,
} from '../services/api/kasa';
import { computeCashBalanceForRegister } from './cashBalance';
import {
  cashVirmanDirection,
  isCashVirmanType,
  withCashVirmanLines,
} from './cashVirman';
import { isReturnSale } from './posZReport';
import { dbPaymentMethodToFormCode, type PaymentFormCode } from './paymentMethodUtils';
import { isDepositSale } from './reportDepositFilter';
import { isPurchaseReturnCashVoucher, isSalesReturnCashVoucher } from './invoiceCashRegisterPosting';
import { PERIOD_SUMMARY_CASH_OUT_TYPES } from './reportUnifiedExpenses';
import { istanbulCalendarDateKey } from './localCalendarDate';
import { receivableAfterDiscount, saleCollectedSplit, type SalePaymentRow } from './saleCollectedAmounts';

const CASH_CODE = 'NAKIT';
const RESERVATION_CODE = 'REZERVASYON_AVANS';
const EXPENSE_CODE = 'GIDER';
const SKIP_DISTRIBUTION = new Set<PaymentFormCode>(['CEK', 'SENET']);

/**
 * Kasa Durumu listesinde ve Ödeme Dağılımı kart/listesinde gizlenen kodlar.
 * Kasa Durumu üstündeki Günlük Kart kartı bu kümeye girmez.
 * Tutarlar `paymentReportGrandTotal` içinde kalır; formül değişmez.
 */
const HIDDEN_CASH_STATUS_LIST_CODES = new Set(['KREDIKARTI', 'HAVAL']);

const CASH_OUT_TYPES = new Set([
  'CH_ODEME',
  'KASA_CIKIS',
  'BANKA_YATIRILAN',
  'ACILIS_ALACAK',
  'GIDER_PUSULASI',
  'VERILEN_SERBEST_MESLEK',
  'ALIS_FATURASI',
  'MAAS_ODEME',
  'AVANS_ODEME',
  'ORTAK_SERMAYE_ODEME',
  'ORTAK_PARA_CIKIS',
  'KUR_FARKI_BORC',
  'MUSTAHSIL_MAKBUZU',
]);

export const CASH_REGISTER_UNASSIGNED_ID = '__unassigned__';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface CashStatusPaymentLine {
  code: string;
  amount: number;
  count?: number;
  percentage?: number;
  /** Bilgi satırı — genel toplama katılmaz (rezervasyon zaten nakittedir). */
  informational?: boolean;
  /** Gider satırı. Tahsilattan bir kez düşülür; pasta dilimi değildir. */
  deduction?: boolean;
  label?: string;
  color?: string;
  nameKey?: string;
}

export interface CashStatusFoldInput {
  openingCash: number;
  /** Hizmet / satış nakdi. Rezervasyon bu tutarın içinde değildir. */
  serviceCash: number;
  cardAmount?: number;
  transferAmount?: number;
  /** Henüz hizmet verilmemiş rezervasyon peşinatı (nakit). */
  reservationCash: number;
  /** Nakit çıkışlar (kapanış bakiyesi). Genel toplam bunu ayrıca düşmez. */
  cashOut: number;
  /**
   * Klinik gideri + kasa çıkış fişi. Nakit tahsilattan bir kez düşülür.
   * Kayıt yoksa 0. Kasa bakiyesi zaten net ise bu tutar bakiyeden tekrar düşülmez.
   */
  expense?: number;
  /** Gider satırı adedi. Tutar 0 olsa da satır gösterilir. */
  expenseCount?: number;
  /**
   * Dağılım satırları. NAKIT satırı hizmet nakdidir (rezervasyon hariç).
   * REZERVASYON_AVANS satırı bilgi olarak kalır.
   */
  paymentTypes: CashStatusPaymentLine[];
}

export interface CashStatusFoldResult {
  todayCash: number;
  closingCash: number;
  reservationDeposit: number;
  expense: number;
  paymentTypes: CashStatusPaymentLine[];
  /** Gider düşülmeden önceki tahsilat. Pasta paydası. Rezervasyon yok. */
  collectionTotal: number;
  /** NAKIT (rezervasyon dahil) + kart + açık cari + havale − gider. Rezervasyon satırı yok. */
  grandTotal: number;
}

export interface ReportCollectionParts {
  /** Nakit tahsilat. Rezervasyon bunun içindedir. */
  cash?: number;
  card?: number;
  openAccount?: number;
  transfer?: number;
  /** Bilgi. Toplama yazılmaz. */
  reservation?: number;
  /** Klinik gideri ve kasa çıkış fişi. Bir kez düşülür. */
  expense?: number;
}

/**
 * Kasa Durumu ödeme dağılımı listesi.
 * Kredi kartı ve havale satırları gizlenir. Genel toplam aynı kalır:
 * nakit (rezervasyon dahil) + kart + açık cari + havale − gider.
 */
export function cashStatusDistributionListRows<T extends { code: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => !HIDDEN_CASH_STATUS_LIST_CODES.has(row.code));
}

/**
 * Ödeme Dağılımı üst kartları ve Ödeme Yöntemi Dağılımı listesi.
 * Kredi kartı ve havale gizlenir. Genel toplam bu fonksiyonda hesaplanmaz;
 * nakit (rezervasyon dahil) + kart + açık cari + havale − gider aynı kalır.
 * Kasa Durumu Günlük Kart kartı burada değildir.
 */
export function paymentDistributionVisibleRows<T extends { code: string }>(rows: readonly T[]): T[] {
  return cashStatusDistributionListRows(rows);
}

/**
 * Ödeme dağılımı genel toplamı.
 * Nakit (rezervasyon dahil) + kart + açık cari + havale − gider.
 * Rezervasyon satırı toplama eklenmez.
 */
export function paymentReportGrandTotal(input: ReportCollectionParts): number {
  const expense = Math.max(0, num(input.expense));
  return round2(
    num(input.cash) + num(input.card) + num(input.openAccount) + num(input.transfer) - expense,
  );
}

export interface RegisterNetGrandParts {
  /** Dönem sonu kasa bakiyesi. Gider düşülmüş net. */
  registerNet?: number;
  card?: number;
  openAccount?: number;
  transfer?: number;
  /** Bilgi. Toplama yazılmaz. */
  reservation?: number;
  /**
   * Kasa bakiyesinde zaten düşülmüş gider.
   * Bu fonksiyon tutarı ikinci kez düşmez. Brüt formülle aynı sonuç:
   * registerNet + açık cari = (registerNet + gider) + açık cari − gider.
   */
  expense?: number;
}

/**
 * Kasa durumu genel toplamı, bakiye gider sonrası net ise.
 * Rezervasyon eklenmez. Gider ikinci kez düşülmez.
 */
export function cashRegisterNetGrandTotal(input: RegisterNetGrandParts): number {
  return round2(
    num(input.registerNet) + num(input.card) + num(input.openAccount) + num(input.transfer),
  );
}

function lineAmount(rows: CashStatusPaymentLine[], code: string): number {
  const row = rows.find((item) => item.code === code);
  if (!row || row.informational || row.deduction) return 0;
  return num(row.amount);
}

/**
 * Rezervasyon nakdini günlük nakde ve kapanışa ekler.
 * Dağılımdaki nakit satırı aynı tutarı alır. Rezervasyon satırı
 * informational kalır ve grandTotal dışında tutulur.
 * Gider satırı tahsilattan bir kez düşülür; pasta paydasına girmez.
 */
export function foldReservationIntoCashStatus(input: CashStatusFoldInput): CashStatusFoldResult {
  const opening = num(input.openingCash);
  const serviceCash = num(input.serviceCash);
  const reservation = Math.max(0, num(input.reservationCash));
  const cashOut = Math.max(0, num(input.cashOut));
  const expense = Math.max(0, num(input.expense));
  const todayCash = round2(serviceCash + reservation);
  const closingCash = round2(opening + todayCash - cashOut);

  let sawCash = false;
  const paymentTypes: CashStatusPaymentLine[] = input.paymentTypes
    .filter((row) => row.code !== EXPENSE_CODE)
    .map((row) => {
      if (row.code === CASH_CODE) {
        sawCash = true;
        return {
          ...row,
          amount: round2(num(row.amount) + reservation),
          informational: false,
          deduction: false,
        };
      }
      if (row.code === RESERVATION_CODE) {
        return {
          ...row,
          amount: round2(num(row.amount)),
          informational: true,
          deduction: false,
        };
      }
      if (SKIP_DISTRIBUTION.has(row.code as PaymentFormCode)) {
        return { ...row, informational: true, deduction: false };
      }
      return { ...row, informational: row.informational === true, deduction: row.deduction === true };
    });

  if (!sawCash && reservation > 0.004) {
    paymentTypes.unshift({
      code: CASH_CODE,
      amount: reservation,
      informational: false,
    });
  }

  const parts: ReportCollectionParts = {
    cash: lineAmount(paymentTypes, CASH_CODE),
    card: lineAmount(paymentTypes, 'KREDIKARTI'),
    openAccount: lineAmount(paymentTypes, 'ACIK_CARI'),
    transfer: lineAmount(paymentTypes, 'HAVAL'),
    reservation,
    expense,
  };
  const collectionTotal = paymentReportGrandTotal({ ...parts, expense: 0 });
  const grandTotal = paymentReportGrandTotal(parts);

  paymentTypes.push({
    code: EXPENSE_CODE,
    amount: expense,
    count: Math.max(0, Math.round(num(input.expenseCount))),
    informational: false,
    deduction: true,
    nameKey: 'cashStatusExpense',
    color: '#e11d48',
  });

  const withPct = paymentTypes.map((row) => ({
    ...row,
    percentage:
      row.informational || row.deduction || collectionTotal === 0
        ? 0
        : (num(row.amount) / collectionTotal) * 100,
  }));

  return {
    todayCash,
    closingCash,
    reservationDeposit: reservation,
    expense,
    paymentTypes: withPct,
    collectionTotal,
    grandTotal,
  };
}

export interface CompanyCashSnapshot {
  openingCash: number;
  serviceCash: number;
  card: number;
  transfer: number;
  openAccount: number;
  reservationCash: number;
  cashOut: number;
}

export interface CashRegisterSeed {
  id: string;
  code?: string;
  name?: string;
  serviceCash?: number;
  card?: number;
  transfer?: number;
  openAccount?: number;
  reservationCash?: number;
  cashOut?: number;
  openingCash?: number;
}

/** Gider sayılmayan kasa çıkışı. Dipnot bu kodu ve tutarı olduğu gibi yazar. */
export interface CashRegisterCashOutSlice {
  code: string;
  amount: number;
}

export interface CashRegisterStatusRow {
  id: string;
  code: string;
  name: string;
  openingCash: number;
  todayCash: number;
  reservationDeposit: number;
  todayCard: number;
  closingCash: number;
  payCash: number;
  payCard: number;
  payOpen: number;
  payTransfer: number;
  grandTotal: number;
  /**
   * Dönem içi nakit gider: gider pusulası, kasa çıkış, maaş, avans, cari ödeme.
   * Satış iadesi burada değildir; nakit kolonundan bir kez düşülür.
   * Kayıt yoksa 0.
   */
  expense: number;
  /** Nakit gider tipi olmayan çıkış (banka, virman, kart gideri). Gider kolonuna yazılmaz. */
  otherCashOuts: CashRegisterCashOutSlice[];
  /** Çek ve senet. Kolon değildir; dipnot köprüsünde kalır. */
  skipNet: number;
}

interface Bucket {
  serviceCash: number;
  card: number;
  transfer: number;
  openAccount: number;
  reservationCash: number;
  cashOut: number;
  openingCash: number;
}

function emptyBucket(): Bucket {
  return {
    serviceCash: 0,
    card: 0,
    transfer: 0,
    openAccount: 0,
    reservationCash: 0,
    cashOut: 0,
    openingCash: 0,
  };
}

function addBucket(target: Bucket, extra: Partial<Bucket>): void {
  target.serviceCash = round2(target.serviceCash + num(extra.serviceCash));
  target.card = round2(target.card + num(extra.card));
  target.transfer = round2(target.transfer + num(extra.transfer));
  target.openAccount = round2(target.openAccount + num(extra.openAccount));
  target.reservationCash = round2(target.reservationCash + num(extra.reservationCash));
  target.cashOut = round2(target.cashOut + num(extra.cashOut));
  target.openingCash = round2(target.openingCash + num(extra.openingCash));
}

const BUCKET_KEYS = [
  'serviceCash',
  'card',
  'transfer',
  'openAccount',
  'reservationCash',
  'cashOut',
  'openingCash',
] as const;

function bucketToRow(
  id: string,
  code: string,
  name: string,
  bucket: Bucket,
): CashRegisterStatusRow {
  const payCash = round2(bucket.serviceCash + Math.max(0, bucket.reservationCash));
  const payCard = round2(bucket.card);
  const payOpen = round2(bucket.openAccount);
  const payTransfer = round2(bucket.transfer);
  const openingCash = round2(bucket.openingCash);
  const cashOut = Math.max(0, round2(bucket.cashOut));
  return {
    id,
    code,
    name,
    openingCash,
    todayCash: payCash,
    reservationDeposit: round2(Math.max(0, bucket.reservationCash)),
    todayCard: payCard,
    closingCash: round2(openingCash + payCash - cashOut),
    payCash,
    payCard,
    payOpen,
    payTransfer,
    grandTotal: round2(payCash + payCard + payOpen + payTransfer),
    expense: 0,
    otherCashOuts: [],
    skipNet: 0,
  };
}

function hasMovement(bucket: Bucket): boolean {
  return BUCKET_KEYS.some((key) => Math.abs(bucket[key]) > 0.004);
}

/**
 * Şirket özetini kasa tohumlarına yayar (eski dağıtım).
 * Kasalar sekmesi bunu kullanmaz. Sekme `cashRegisterStatusFromLedger`
 * ile her kasanın kendi kasa kartı hareketini okur.
 * Çek ve senet dağılıma girmez.
 */
export function listCashRegisterStatus(args: {
  registers: Array<{ id: string; code?: string | null; name?: string | null }>;
  seeds?: CashRegisterSeed[];
  company: CompanyCashSnapshot;
  unassignedLabel: string;
}): CashRegisterStatusRow[] {
  const byId = new Map<string, { code: string; name: string; bucket: Bucket }>();
  const ensure = (id: string, code: string, name: string) => {
    const key = id || CASH_REGISTER_UNASSIGNED_ID;
    if (!byId.has(key)) {
      byId.set(key, {
        code,
        name: name || code || key,
        bucket: emptyBucket(),
      });
    }
    return byId.get(key)!;
  };

  for (const register of args.registers) {
    const id = String(register.id || '').trim();
    if (!id) continue;
    ensure(id, String(register.code || '').trim(), String(register.name || register.code || id));
  }

  for (const seed of args.seeds || []) {
    const id = String(seed.id || '').trim() || CASH_REGISTER_UNASSIGNED_ID;
    const row = ensure(id, String(seed.code || '').trim(), String(seed.name || seed.code || id));
    addBucket(row.bucket, seed);
  }

  const company: Bucket = {
    serviceCash: num(args.company.serviceCash),
    card: num(args.company.card),
    transfer: num(args.company.transfer),
    openAccount: num(args.company.openAccount),
    reservationCash: Math.max(0, num(args.company.reservationCash)),
    cashOut: Math.max(0, num(args.company.cashOut)),
    openingCash: num(args.company.openingCash),
  };

  const sum = emptyBucket();
  for (const row of byId.values()) addBucket(sum, row.bucket);

  for (const key of BUCKET_KEYS) {
    const companyValue = company[key];
    const seedValue = sum[key];
    if (seedValue > companyValue + 0.004 && seedValue > 0.004) {
      const factor = companyValue > 0.004 ? companyValue / seedValue : 0;
      for (const row of byId.values()) {
        row.bucket[key] = round2(row.bucket[key] * factor);
      }
    }
  }

  const sumAfter = emptyBucket();
  for (const row of byId.values()) addBucket(sumAfter, row.bucket);
  const remainder = emptyBucket();
  for (const key of BUCKET_KEYS) {
    remainder[key] = round2(company[key] - sumAfter[key]);
    if (remainder[key] < 0) remainder[key] = 0;
  }

  const registerIds = args.registers
    .map((register) => String(register.id || '').trim())
    .filter(Boolean);
  const soleId = registerIds.length === 1 ? registerIds[0] : '';
  if (hasMovement(remainder)) {
    const targetId = soleId || CASH_REGISTER_UNASSIGNED_ID;
    const target = ensure(
      targetId,
      '',
      targetId === CASH_REGISTER_UNASSIGNED_ID ? args.unassignedLabel : (byId.get(targetId)?.name || targetId),
    );
    addBucket(target.bucket, remainder);
  }

  const rows = Array.from(byId.entries())
    .map(([id, row]) => bucketToRow(id, row.code, row.name, row.bucket))
    .filter((row) => {
      if (row.id === CASH_REGISTER_UNASSIGNED_ID) {
        return Math.abs(row.todayCash) + Math.abs(row.todayCard) + Math.abs(row.payOpen)
          + Math.abs(row.payTransfer) + Math.abs(row.reservationDeposit) + Math.abs(row.openingCash) > 0.004;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  if (rows.length === 0 && hasMovement(company)) {
    return [bucketToRow(CASH_REGISTER_UNASSIGNED_ID, '', args.unassignedLabel, company)];
  }
  return rows;
}

export interface CashStatusSaleSlice {
  total: number;
  paymentMethod?: unknown;
  payments?: Array<{ method?: unknown; amount?: number; cash_register_id?: string | null }> | null;
  cashRegisterId?: string | null;
  isDeposit?: boolean;
  notes?: string | null;
  /** Brüt belgeden düşülen iskonto. Açık cariye yazılmaz. */
  discount?: number | null;
}

export interface CashStatusRegisterLine {
  id?: string | null;
  kasa_id?: string | null;
  islem_tipi?: string | null;
  tutar?: number | null;
  ozel_kod?: string | null;
  special_code?: string | null;
  is_reservation_deposit?: boolean | null;
  /** cash_lines.payment_method — nakit / kart ayrımı */
  payment_method?: string | null;
  islem_tarihi?: string | null;
  /** Fiş no — aynı nakit iade defterde varsa ikinci kez düşülmez */
  islem_no?: string | null;
  fiche_no?: string | null;
  islem_aciklamasi?: string | null;
  aciklama?: string | null;
  cari_hesap_unvani?: string | null;
  party_name?: string | null;
  category?: string | null;
  kategori?: string | null;
  kasa_adi?: string | null;
  register_name?: string | null;
  /** Yazılmış işaret. Virman hedef satırında +1, kaynakta −1. */
  sign?: number | null;
  target_register_id?: string | null;
  doviz_kodu?: string | null;
  currency?: string | null;
  currency_code?: string | null;
}

/**
 * Satış iadesinin kasadan çıkan payı.
 * Peşinat fişi buraya yazılmaz. Tutar artıdır; kolon ve kalan bir kez düşer.
 */
export interface CashRegisterRefund {
  id?: string | null;
  ficheNo?: string | null;
  amount: number;
  /** cash | card | transfer. Boş yöntem nakit sayılır. Peşinat / avans atlanır. */
  method?: string | null;
  registerId?: string | null;
  date?: string | null;
}

export interface CashRegisterRefundSale {
  id?: string;
  receiptNumber?: string | null;
  date?: string | Date | null;
  total?: number | null;
  paymentMethod?: unknown;
  payments?: Array<SalePaymentRow & { cash_register_id?: string | null }> | null;
  status?: string | null;
  discount?: number | null;
  isDeposit?: boolean | null;
  notes?: string | null;
}

function formCodeOf(raw: unknown): PaymentFormCode | '' {
  return dbPaymentMethodToFormCode(raw);
}

function addFormAmount(bucket: Bucket, code: PaymentFormCode | '', amount: number): void {
  if (!(Math.abs(amount) > 0.004)) return;
  if (!code || SKIP_DISTRIBUTION.has(code)) return;
  if (code === 'NAKIT') bucket.serviceCash = round2(bucket.serviceCash + amount);
  else if (code === 'KREDIKARTI') bucket.card = round2(bucket.card + amount);
  else if (code === 'HAVAL') bucket.transfer = round2(bucket.transfer + amount);
  else if (code === 'ACIK_CARI') bucket.openAccount = round2(bucket.openAccount + amount);
}

/** Satış tahsilatını kasalara böler. Çek/senet yazılmaz. Depozito fişi atlanır. */
export function seedsFromCashStatusSales(sales: CashStatusSaleSlice[]): CashRegisterSeed[] {
  const map = new Map<string, Bucket>();
  const touch = (id: string) => {
    const key = id.trim();
    if (!map.has(key)) map.set(key, emptyBucket());
    return map.get(key)!;
  };

  for (const sale of sales) {
    if (sale.isDeposit === true) continue;
    if (/parent_sale:|sale_group:|deposit:1/.test(String(sale.notes ?? ''))) continue;
    const signed = num(sale.total);
    if (signed === 0) continue;
    const sign = signed < 0 ? -1 : 1;
    const absDoc = Math.abs(signed);
    const fallback = String(sale.cashRegisterId || '').trim();
    const rows = Array.isArray(sale.payments) ? sale.payments.filter((row) => row != null) : [];
    if (rows.length > 0) {
      let nonCredit = 0;
      const creditParts: Array<{ reg: string; amt: number }> = [];
      for (const row of rows) {
        const amt = Math.abs(num(row.amount));
        if (!(amt > 0)) continue;
        const code = formCodeOf(row.method) || 'ACIK_CARI';
        const reg = String(row.cash_register_id || fallback).trim();
        if (code === 'ACIK_CARI') {
          creditParts.push({ reg, amt });
          continue;
        }
        addFormAmount(touch(reg), code, amt * sign);
        nonCredit += amt;
      }
      const discountAbs = Math.max(0, Math.abs(num(sale.discount)));
      const open = receivableAfterDiscount(absDoc, nonCredit, discountAbs);
      const explicit = creditParts.reduce((sum, part) => sum + part.amt, 0);
      const tolerance = discountAbs > 0 ? 1 : 0.004;
      if (open > tolerance) {
        if (explicit > open + tolerance && explicit > 0) {
          const factor = open / explicit;
          for (const part of creditParts) {
            addFormAmount(touch(part.reg), 'ACIK_CARI', part.amt * factor * sign);
          }
        } else if (explicit > tolerance) {
          for (const part of creditParts) {
            addFormAmount(touch(part.reg), 'ACIK_CARI', part.amt * sign);
          }
          const gap = open - explicit;
          if (gap > tolerance) addFormAmount(touch(fallback), 'ACIK_CARI', gap * sign);
        } else {
          addFormAmount(touch(fallback), 'ACIK_CARI', open * sign);
        }
      }
      continue;
    }
    const code = formCodeOf(sale.paymentMethod) || 'ACIK_CARI';
    const discountAbs = Math.max(0, Math.abs(num(sale.discount)));
    const signedNet = code === 'ACIK_CARI'
      ? Math.max(0, absDoc - discountAbs) * sign
      : signed;
    addFormAmount(touch(fallback), code, signedNet);
  }

  const seeds: CashRegisterSeed[] = [];
  for (const [id, bucket] of map) {
    if (!id) continue;
    if (!hasMovement(bucket)) continue;
    seeds.push({ id, ...bucket });
  }
  return seeds;
}

export function isReservationCashLine(
  line: CashStatusRegisterLine,
  appliedCashLineIds?: ReadonlySet<string> | null,
): boolean {
  const tip = String(line.islem_tipi || '').trim().toUpperCase();
  if (tip !== 'CH_TAHSILAT') return false;
  const lineId = String(line.id || '').trim();
  if (appliedCashLineIds && lineId && appliedCashLineIds.has(lineId)) return false;
  if (line.is_reservation_deposit === true) return true;
  const code = String(line.ozel_kod || line.special_code || '').trim().toUpperCase();
  return code === 'REZERVASYON' || code === 'AVANS';
}

export function seedsFromRegisterCashLines(
  lines: CashStatusRegisterLine[],
  appliedCashLineIds?: ReadonlySet<string> | null,
): CashRegisterSeed[] {
  const map = new Map<string, Bucket>();
  const touch = (id: string) => {
    const key = id.trim();
    if (!map.has(key)) map.set(key, emptyBucket());
    return map.get(key)!;
  };

  for (const line of lines) {
    const amount = Math.abs(num(line.tutar));
    if (!(amount > 0.004)) continue;
    const reg = String(line.kasa_id || '').trim();
    if (!reg) continue;
    const tip = String(line.islem_tipi || '').trim().toUpperCase();
    if (isReservationCashLine(line, appliedCashLineIds)) {
      touch(reg).reservationCash = round2(touch(reg).reservationCash + amount);
      continue;
    }
    // ACILIS_BORC kasa girişidir (+1). ACILIS_ALACAK aşağıda çıkıştır (−1).
    if (tip === 'ACILIS_BORC' || tip === 'ACILIS') {
      touch(reg).serviceCash = round2(touch(reg).serviceCash + amount);
      continue;
    }
    if (CASH_OUT_TYPES.has(tip)) {
      touch(reg).cashOut = round2(touch(reg).cashOut + amount);
    }
  }

  return Array.from(map.entries())
    .filter(([, bucket]) => hasMovement(bucket))
    .map(([id, bucket]) => ({ id, ...bucket }));
}

export function mergeRegisterSeeds(groups: CashRegisterSeed[][]): CashRegisterSeed[] {
  const map = new Map<string, CashRegisterSeed>();
  for (const group of groups) {
    for (const seed of group) {
      const id = String(seed.id || '').trim();
      if (!id) continue;
      const current = map.get(id) || { id };
      map.set(id, {
        id,
        code: current.code || seed.code,
        name: current.name || seed.name,
        serviceCash: round2(num(current.serviceCash) + num(seed.serviceCash)),
        card: round2(num(current.card) + num(seed.card)),
        transfer: round2(num(current.transfer) + num(seed.transfer)),
        openAccount: round2(num(current.openAccount) + num(seed.openAccount)),
        reservationCash: round2(num(current.reservationCash) + num(seed.reservationCash)),
        cashOut: round2(num(current.cashOut) + num(seed.cashOut)),
        openingCash: round2(num(current.openingCash) + num(seed.openingCash)),
      });
    }
  }
  return Array.from(map.values());
}

type DrawerKind = 'cash' | 'card' | 'transfer' | 'open' | 'skip';

/** Kasa kartı satırının nakit / kart ayrımı. Boş yöntem nakittir; kart ayrıca yazılır. */
function cashVoucherText(line: CashStatusRegisterLine): string {
  return `${line.islem_aciklamasi || ''} ${line.aciklama || ''}`;
}

/** Satış iadesi ve alış iadesi işletme gideri değildir. Virman bu kümeye girmez. */
function isOperatingCashExpense(line: CashStatusRegisterLine, tip: string): boolean {
  const text = cashVoucherText(line);
  if (isSalesReturnCashVoucher(tip, text) || isPurchaseReturnCashVoucher(tip, text)) return false;
  return PERIOD_SUMMARY_CASH_OUT_TYPES.has(tip);
}

function drawerKind(line: CashStatusRegisterLine): DrawerKind {
  const raw = String(line.payment_method ?? '').trim().toLowerCase();
  if (raw === 'gateway' || raw.includes('sanal')) return 'card';
  const code = formCodeOf(line.payment_method);
  if (code === 'CEK' || code === 'SENET') return 'skip';
  if (code === 'KREDIKARTI') return 'card';
  if (code === 'HAVAL') return 'transfer';
  if (code === 'ACIK_CARI') return 'open';
  if (code === 'NAKIT') return 'cash';
  if (!raw || raw === 'cash' || raw === 'nakit') return 'cash';
  if (raw === 'credit' || raw === 'veresiye' || raw === 'open' || raw === 'open_account') return 'open';
  return 'cash';
}

function signedLedgerAmount(line: CashStatusRegisterLine): number {
  const amount = Math.abs(num(line.tutar));
  if (!(amount > 0)) return 0;
  const virman = cashVirmanDirection(line);
  if (virman) return amount * virman;
  const sign = computeKasaIslemiSign(String(line.islem_tipi || ''));
  if (!sign) return 0;
  return amount * sign;
}

/**
 * Fatura menüsünden düşen fiş, kasa satırında satış/hizmet tahsilatı
 * veya alış ödemesi olarak durur. İşaret, kayda geçen cari fişin
 * işaretidir: satış ve hizmet +1, alış −1.
 */
function voucherSignedAmount(line: CashStatusRegisterLine): number {
  const amount = Math.abs(num(line.tutar));
  if (!(amount > 0)) return 0;
  const virman = cashVirmanDirection(line);
  if (virman) return amount * virman;
  const tip = String(line.islem_tipi || '').trim().toUpperCase();
  const posted = isKasaInvoiceIslemTipi(tip) ? postedCashTypeForInvoiceIslem(tip) : tip;
  const sign = computeKasaIslemiSign(posted);
  if (!sign) return 0;
  return amount * sign;
}

/**
 * Fiş no koddur. `I` / `İ` ve `i` aynı fiştir.
 * Türkçe küçük harf `I` harfini `ı` yapar; FIS-138 ile fis-138 ayrılır.
 */
function receiptKey(value: unknown): string {
  return String(value ?? '').trim().replace(/İ/g, 'I').toLowerCase();
}

function saleReceiptKeySet(keys: Iterable<string> | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!keys) return out;
  for (const key of keys) {
    const folded = receiptKey(key);
    if (folded && folded !== '—' && folded !== '-') out.add(folded);
  }
  return out;
}

function expenseKeyHit(line: CashStatusRegisterLine, keys: ReadonlySet<string>): boolean {
  if (keys.size === 0) return false;
  const direct = [line.id, line.islem_no, line.fiche_no].map(receiptKey).filter(Boolean);
  return direct.some((key) => keys.has(key));
}

function lineMatchesSaleReceipt(line: CashStatusRegisterLine, keys: ReadonlySet<string>): boolean {
  if (keys.size === 0) return false;
  const direct = [line.islem_no, line.fiche_no].map(receiptKey).filter(Boolean);
  if (direct.some((key) => keys.has(key))) return true;
  const blob = [line.islem_aciklamasi, line.aciklama].map(receiptKey).filter(Boolean).join(' ');
  if (!blob) return false;
  for (const key of keys) {
    if (key.length >= 4 && blob.includes(key)) return true;
  }
  return false;
}

const SALE_INVOICE_COLLECTION_TYPES = new Set(['SATIS_FATURASI', 'HIZMET_FATURASI']);

/**
 * Fatura kaydının kasa aynası. Satış tahsilatı günlük nakitteyse
 * bu satır ikinci kez eklenmez. Açıklamadaki fiş no satış anahtarıyla
 * eşleşmese de "Satış faturası" / "Güzellik Satışı" aynası nakdi şişirmez.
 */
const AUTO_SALE_CASH_MARKERS = [
  'satış faturası',
  'satis faturasi',
  'verilen hizmet faturası',
  'verilen hizmet faturasi',
  'güzellik satış',
  'guzellik satis',
  'market satış',
  'market satis',
];

function autoSaleCashBlob(line: CashStatusRegisterLine): string {
  return [line.islem_aciklamasi, line.aciklama, line.islem_no, line.fiche_no]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr-TR');
}

function looksLikeAutoSaleCashIn(line: CashStatusRegisterLine, tip: string): boolean {
  if (tip !== 'KASA_GIRIS' && !SALE_INVOICE_COLLECTION_TYPES.has(tip)) return false;
  const blob = autoSaleCashBlob(line);
  if (!blob) return false;
  return AUTO_SALE_CASH_MARKERS.some((marker) => blob.includes(marker));
}

/**
 * Satış tahsilatı günlük nakitteyse aynı kasa fişi eklenmez.
 * Cari tahsilat raporun ek tahsilatına girdiyse ikinci kez yazılmaz.
 * Fatura aynası (fiş no satıştan farklı olsa da) satış nakdine eklenmez.
 */
function skipSaleCollectionAlreadyInCash(
  line: CashStatusRegisterLine,
  tip: string,
  saleReceiptKeys: ReadonlySet<string>,
  customerCollectionsInSalesCash: boolean,
): boolean {
  if (tip === 'KASA_GIRIS' && lineMatchesSaleReceipt(line, saleReceiptKeys)) return true;
  if (
    customerCollectionsInSalesCash
    && looksLikeAutoSaleCashIn(line, tip)
  ) {
    return true;
  }
  if (tip === 'CH_TAHSILAT' && (customerCollectionsInSalesCash || lineMatchesSaleReceipt(line, saleReceiptKeys))) {
    return true;
  }
  if (SALE_INVOICE_COLLECTION_TYPES.has(tip) && (customerCollectionsInSalesCash || lineMatchesSaleReceipt(line, saleReceiptKeys))) {
    return true;
  }
  return false;
}

/**
 * Satış fişiyle aynı tahsilatın fatura aynası.
 * Fiş no satışta varsa satır kalır (çekmecedeki asıl giriş).
 * Fiş no satışta yoksa ikinci kayıttır; bakiyeden düşülür.
 */
function withoutDuplicateSaleInvoices(
  lines: CashStatusRegisterLine[],
  saleReceiptKeys: Iterable<string> | null | undefined,
): CashStatusRegisterLine[] {
  const keys = saleReceiptKeySet(saleReceiptKeys);
  if (keys.size === 0) return lines;
  return lines.filter((line) => {
    const tip = String(line.islem_tipi || '').trim().toUpperCase();
    if (!looksLikeAutoSaleCashIn(line, tip)) return true;
    return lineMatchesSaleReceipt(line, keys);
  });
}

export interface CashStatusVoucherInput {
  /**
   * Satış tahsilatı. Rezervasyon bu tutarın içindeyse ayrıca eklenmez.
   * Çağıran, ekrandaki günlük nakdi (rezervasyon bir kez dahil) geçirir.
   */
  salesCash: number;
  card?: number;
  openAccount?: number;
  transfer?: number;
  /** Bilgi. Nakde ve genel toplama tekrar yazılmaz. */
  reservation?: number;
  /** Açık cari değildir. Toplama yazılmaz. */
  discount?: number;
  /**
   * Dönem gideri. Verilirse bu tutar bir kez düşülür.
   * Verilmezse gider fişlerinin mutlak tutarı bir kez gider olur.
   */
  expense?: number;
  /**
   * Gider toplamına alınmış fiş no / satır kimliği.
   * Bu kümedeki gider fişi ikinci kez düşülmez.
   * Küme verilmezse `expense` tüm gider fişlerini kapsar.
   * Boş küme, hiçbir gider fişinin toplama girmediği anlamına gelir.
   */
  countedExpenseKeys?: Iterable<string> | null;
  lines?: readonly CashStatusRegisterLine[];
  dateFrom?: string;
  dateTo?: string;
  /** Satış fiş numaraları. Eşleşen tahsilat satırı eklenmez. */
  saleReceiptKeys?: Iterable<string>;
  /**
   * Rapor, satıştaki ve ek cari tahsilatı NAKIT kovasına yazdıysa true.
   * CH_TAHSILAT o zaman ikinci kez eklenmez.
   */
  customerCollectionsInSalesCash?: boolean;
}

export interface CashStatusVoucherResult {
  /** Aralıktan önceki kasa. Aralık içindeki açılış fişi burada değildir. */
  openingCash: number;
  /** Satış nakdi + dönem kasa fişleri (açılış alacak eksi, açılış borç artı). */
  todayCash: number;
  closingCash: number;
  reservation: number;
  expense: number;
  openAccount: number;
  card: number;
  transfer: number;
  grandTotal: number;
  /** Dönem fişlerinin nakit işareti. Satış tahsilatı bu deltanın dışındadır. */
  cashDelta: number;
}

/**
 * Kasa Durumu KPI ve genel toplam — kasa fişlerinin işareti.
 *
 * Satış nakdi olduğu gibi kalır. ACILIS_ALACAK (−1) nakitten bir kez düşer.
 * ACILIS_BORC (+1) nakde bir kez eklenir. KASA_GIRIS, BANKADAN_CEKILEN ve
 * satışta olmayan cari tahsilat artıdır. BANKA_YATIRILAN eksidir.
 * KASA_CIKIS, CH_ODEME ve gider pusulası giderdir; bir kez düşülür.
 * Virman kaynakta düşer, hedefte artar, genel toplam aynı kalır.
 * Peşinat bilgi satırıdır. İndirim açık cariye ve toplama yazılmaz.
 * Aralık içindeki açılış fişi dönem hareketidir. Açılış, aralık öncesidir.
 */
export function cashStatusWithVouchers(input: CashStatusVoucherInput): CashStatusVoucherResult {
  const salesCash = round2(num(input.salesCash));
  const cardBase = round2(num(input.card));
  const openBase = round2(num(input.openAccount));
  const transferBase = round2(num(input.transfer));
  const reservation = round2(Math.max(0, num(input.reservation)));
  const expenseProvided = input.expense != null;
  const expenseParam = expenseProvided ? Math.max(0, round2(num(input.expense))) : 0;
  const dateFrom = String(input.dateFrom || '').slice(0, 10);
  const dateTo = String(input.dateTo || '').slice(0, 10);
  const saleReceiptKeys = saleReceiptKeySet(input.saleReceiptKeys);
  const expenseKeysProvided = input.countedExpenseKeys != null;
  const countedExpenseKeys = saleReceiptKeySet(input.countedExpenseKeys);
  const collectionsInSales = input.customerCollectionsInSalesCash === true;
  const lines = withCashVirmanLines(input.lines || []) as CashStatusRegisterLine[];

  let openingCash = 0;
  let cashDelta = 0;
  let cardDelta = 0;
  let transferDelta = 0;
  let openDelta = 0;
  let expenseFromLines = 0;

  const addKind = (kind: DrawerKind, signed: number) => {
    if (kind === 'card') cardDelta = round2(cardDelta + signed);
    else if (kind === 'transfer') transferDelta = round2(transferDelta + signed);
    else if (kind === 'open') openDelta = round2(openDelta + signed);
    else if (kind === 'cash') cashDelta = round2(cashDelta + signed);
  };

  for (const line of lines) {
    const day = ledgerDay(line.islem_tarihi);
    if (day && dateTo && day > dateTo) continue;
    const before = Boolean(day && dateFrom && day < dateFrom);
    const signed = voucherSignedAmount(line);
    if (!(Math.abs(signed) > 0.004)) continue;
    const kind = drawerKind(line);
    if (kind === 'skip') continue;
    if (before) {
      if (kind === 'cash') openingCash = round2(openingCash + signed);
      continue;
    }
    const tip = String(line.islem_tipi || '').trim().toUpperCase();
    if (isReservationCashLine(line)) continue;
    if (skipSaleCollectionAlreadyInCash(line, tip, saleReceiptKeys, collectionsInSales)) continue;
    if (isCashVirmanType(tip)) {
      addKind(kind, signed);
      continue;
    }
    if (isOperatingCashExpense(line, tip)) {
      // Sıfır gider toplamı satırı "sayılmış" saymaz. Anahtar dolu olsa da
      // tutar 0 ise fiş henüz nakitten düşmemiştir; bir kez düşülür.
      const coveredByTotal = expenseProvided && expenseParam > 0.004 && (
        !expenseKeysProvided || expenseKeyHit(line, countedExpenseKeys)
      );
      if (!coveredByTotal) expenseFromLines = round2(expenseFromLines + Math.abs(signed));
      continue;
    }
    addKind(kind, signed);
  }

  const todayCash = round2(salesCash + cashDelta);
  const card = round2(cardBase + cardDelta);
  const openAccount = round2(openBase + openDelta);
  const transfer = round2(transferBase + transferDelta);
  const expense = round2((expenseProvided ? expenseParam : 0) + expenseFromLines);
  const grandTotal = paymentReportGrandTotal({
    cash: todayCash,
    card,
    openAccount,
    transfer,
    reservation,
    expense,
  });
  return {
    openingCash: round2(openingCash),
    todayCash,
    closingCash: round2(openingCash + todayCash - expense),
    reservation,
    expense,
    openAccount,
    card,
    transfer,
    grandTotal,
    cashDelta: round2(cashDelta),
  };
}

export interface CashStatusThreeBoxInput {
  /**
   * Satış tahsilatı. Peşinat bu tutarın içindeyse ayrıca eklenmez.
   * Aralık içindeki açılış alacak bu tutardan düşülmez; çıkan kutusuna yazılır.
   */
  salesCash: number;
  /** Bilgi. Girene ve çıkana eklenmez. */
  reservation?: number;
  /** İndirim açık cari değildir. Girene ve çıkana eklenmez. */
  discount?: number;
  /**
   * Dönem gideri. Verilirse bir kez çıkana yazılır.
   * Aynı fiş satırı ikinci kez çıkana girmez.
   */
  expense?: number;
  countedExpenseKeys?: Iterable<string> | null;
  lines?: readonly CashStatusRegisterLine[];
  dateFrom?: string;
  dateTo?: string;
  saleReceiptKeys?: Iterable<string>;
  customerCollectionsInSalesCash?: boolean;
  /**
   * Kasalar tablosunun toplamı.
   * Filtresiz yılda bakiye budur; yıl formülü (önceki + giren − çıkan) bunu ezmez.
   */
  registerTotal?: number | null;
  /**
   * true: bakiye kasalar toplamıdır.
   * false: bakiye her zaman önceki + giren − çıkan.
   * Verilmezse eski kural: aralık bugünde bitiyorsa kasalar toplamı.
   */
  balanceFromRegisters?: boolean;
  /** Seçili aralığın son günü bugün veya sonrası. `balanceFromRegisters` yokken okunur. */
  rangeEndsToday?: boolean;
  /**
   * true: giren ve çıkan yalnız kasa fişleridir.
   * Satış nakdi, kasada satırı yoksa girene yazılmaz.
   * Peşinat satırı bir kez girer. Gider parametresi çıkış fişi değilse çıkan olmaz.
   */
  countLedgerInflows?: boolean;
}

export interface CashStatusThreeBoxResult {
  /** Seçili aralıkta kasaya giren. Peşinat bir kez. */
  totalIn: number;
  /** Seçili aralıkta kasadan çıkan. Gider bir kez. */
  totalOut: number;
  /** Aralık başlamadan önceki kasa. Aralık içindeki açılış fişi burada değildir. */
  priorBalance: number;
  /**
   * Filtresizken kasalar toplamı.
   * Filtreliyken aralık sonu: önceki + giren − çıkan.
   * Aralık bugünde bitiyorsa bu formül güncel bakiyedir.
   */
  balance: number;
}

/**
 * Kasa Durumu üç kutusu.
 *
 * Giren: satış tahsilatı (peşinat bunun içindeyse ikinci kez yok) ve aralıktaki
 * kasa girişi. Açılış borç (işaret +1) girendir.
 * Çıkan: gider, açılış alacak (işaret −1), cari ödeme ve bankaya yatan. Bir kez.
 * Virman şirket bakiyesini değiştirmez; girene ve çıkana yazılmaz.
 * İndirim ve açık cari bu iki kutuya girmez.
 * Filtresiz yıl aralığında bakiye kasalar toplamıdır.
 * Filtreliyken bakiye = aralık öncesi + giren − çıkan.
 */
export function cashStatusThreeBoxes(input: CashStatusThreeBoxInput): CashStatusThreeBoxResult {
  const salesCash = round2(num(input.salesCash));
  const expenseProvided = input.expense != null;
  const expenseParam = expenseProvided ? Math.max(0, round2(num(input.expense))) : 0;
  const dateFrom = String(input.dateFrom || '').slice(0, 10);
  const dateTo = String(input.dateTo || '').slice(0, 10);
  const saleReceiptKeys = saleReceiptKeySet(input.saleReceiptKeys);
  const expenseKeysProvided = input.countedExpenseKeys != null;
  const countedExpenseKeys = saleReceiptKeySet(input.countedExpenseKeys);
  const collectionsInSales = input.customerCollectionsInSalesCash === true;
  const lines = withCashVirmanLines(input.lines || []) as CashStatusRegisterLine[];
  // İndirim parametresi kasaya yazılmaz. Açık cari satırı da aşağıda atlanır.
  void input.discount;
  void input.reservation;

  let priorBalance = 0;
  let extraIn = 0;
  let extraOut = 0;
  let expenseFromLines = 0;

  for (const line of lines) {
    const day = ledgerDay(line.islem_tarihi);
    if (day && dateTo && day > dateTo) continue;
    const before = Boolean(day && dateFrom && day < dateFrom);
    const signed = voucherSignedAmount(line);
    if (!(Math.abs(signed) > 0.004)) continue;
    const kind = drawerKind(line);
    if (kind !== 'cash') continue;
    if (before) {
      priorBalance = round2(priorBalance + signed);
      continue;
    }
    const tip = String(line.islem_tipi || '').trim().toUpperCase();
    if (isReservationCashLine(line)) continue;
    if (skipSaleCollectionAlreadyInCash(line, tip, saleReceiptKeys, collectionsInSales)) continue;
    if (isCashVirmanType(tip)) continue;
    if (isOperatingCashExpense(line, tip)) {
      const coveredByTotal = expenseProvided && expenseParam > 0.004 && (
        !expenseKeysProvided || expenseKeyHit(line, countedExpenseKeys)
      );
      if (!coveredByTotal) expenseFromLines = round2(expenseFromLines + Math.abs(signed));
      continue;
    }
    if (signed > 0.004) extraIn = round2(extraIn + signed);
    else extraOut = round2(extraOut + Math.abs(signed));
  }

  let totalIn = round2(salesCash + extraIn);
  let totalOut = round2((expenseProvided ? expenseParam : 0) + expenseFromLines + extraOut);
  let prior = round2(priorBalance);
  if (input.countLedgerInflows) {
    // Kasaya yazılmamış hizmet girene eklenmez. Peşinat satırı bir kez sayılır.
    // Gider parametresi kasa çıkışı değilse çıkan uydurulmaz.
    const ledger = ledgerCashPeriodFlow({
      lines: input.lines,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      saleReceiptKeys: input.saleReceiptKeys,
    });
    totalIn = ledger.totalIn;
    totalOut = ledger.totalOut;
    prior = ledger.priorBalance;
  }
  const formulaBalance = round2(prior + totalIn - totalOut);
  return {
    totalIn,
    totalOut,
    priorBalance: prior,
    balance: cashStatusDisplayedBalance({
      formulaBalance,
      registerTotal: input.registerTotal,
      balanceFromRegisters: input.balanceFromRegisters,
      rangeEndsToday: input.rangeEndsToday,
    }),
  };
}

/** Yeşil kutu. Filtresizken kasalar toplamı; filtreliyken aralık formülü. */
export function cashStatusDisplayedBalance(input: {
  formulaBalance: number;
  registerTotal?: number | null;
  balanceFromRegisters?: boolean;
  rangeEndsToday?: boolean;
}): number {
  const formulaBalance = round2(num(input.formulaBalance));
  const registerTotal = input.registerTotal;
  const registerReady = registerTotal != null && Number.isFinite(Number(registerTotal));
  const useRegisters = input.balanceFromRegisters === true
    ? registerReady
    : input.balanceFromRegisters == null && input.rangeEndsToday === true && registerReady;
  return useRegisters ? round2(num(registerTotal)) : formulaBalance;
}

/**
 * Kasa satırının takvim günü.
 * `YYYY-MM-DD` olduğu gibi kalır. Date nesnesi ve saatli dizge yerel güne çevrilir
 * (Kasa Yönetimi bugün hesabı ile aynı yerel takvim).
 */
function ledgerDay(value: unknown): string {
  if (value instanceof Date) return istanbulCalendarDateKey(value);
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return '';
  // Takvim günü olduğu gibi kalır. Saatli değer İstanbul gününe çevrilir; UTC günü yazılmaz.
  if (raw.length === 10) return match[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return match[1];
  return istanbulCalendarDateKey(parsed);
}

function balanceOf(registerId: string, lines: CashStatusRegisterLine[]): number {
  if (registerId === CASH_REGISTER_UNASSIGNED_ID) {
    return round2(lines.reduce((sum, line) => sum + signedLedgerAmount(line), 0));
  }
  return round2(computeCashBalanceForRegister(registerId, lines as unknown as KasaIslemi[]));
}

function refundDrawerKind(method: unknown): 'cash' | 'card' | 'transfer' | '' {
  const folded = String(method ?? '').trim().toLocaleLowerCase('tr-TR');
  if (
    folded.includes('avans')
    || folded.includes('rezervasyon')
    || folded.includes('depozito')
    || folded.includes('peşinat')
    || folded.includes('pesinat')
  ) {
    return '';
  }
  const kind = drawerKind({ payment_method: folded || 'cash' });
  if (kind === 'cash' || kind === 'card' || kind === 'transfer') return kind;
  return '';
}

function refundInRange(date: unknown, dateFrom: string, dateTo: string): boolean {
  const day = ledgerDay(date);
  if (!day) return true;
  if (dateFrom && day < dateFrom) return false;
  if (dateTo && day > dateTo) return false;
  return true;
}

function refundLineBlob(line: CashStatusRegisterLine): string {
  return [line.islem_no, line.fiche_no, line.islem_aciklamasi, line.aciklama]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr-TR');
}

/** Satış iadesi fişi defterde varsa gider değildir; nakit kolonundan bir kez düşülür. */
function matchesListedRefund(
  line: CashStatusRegisterLine,
  refunds: readonly CashRegisterRefund[],
): boolean {
  if (!(signedLedgerAmount(line) < -0.004)) return false;
  const blob = refundLineBlob(line);
  if (!blob) return false;
  return refunds.some((refund) => {
    const fiche = String(refund.ficheNo || '').trim().toLocaleLowerCase('tr-TR');
    return !!fiche && blob.includes(fiche);
  });
}

function cashOutSlices(amounts: ReadonlyMap<string, number>): CashRegisterCashOutSlice[] {
  return Array.from(amounts.entries())
    .map(([code, amount]) => ({ code, amount: round2(amount) }))
    .filter((row) => row.amount > 0.004)
    .sort((a, b) => a.code.localeCompare(b.code, 'tr'));
}

/** Eksi kasa satırı aynı fişi taşıyorsa iade bakiyeye zaten yazılmıştır. */
function refundAlreadyPosted(ficheNo: string, lines: readonly CashStatusRegisterLine[]): boolean {
  const fiche = String(ficheNo || '').trim().toLocaleLowerCase('tr-TR');
  if (!fiche) return false;
  return lines.some((line) => {
    if (!(signedLedgerAmount(line) < -0.004)) return false;
    return refundLineBlob(line).includes(fiche);
  });
}

function rowForCashRefund(
  rows: CashRegisterStatusRow[],
  registerId: string,
): CashRegisterStatusRow | undefined {
  const wanted = registerId.trim();
  if (wanted) {
    const hit = rows.find((row) => row.id === wanted);
    if (hit) return hit;
  }
  const real = rows.filter((row) => row.id !== CASH_REGISTER_UNASSIGNED_ID);
  if (real.length === 1) return real[0];
  return rows.find((row) => row.id === CASH_REGISTER_UNASSIGNED_ID);
}

/**
 * Brüt kasa girişinden nakit iadeyi bir kez düşer.
 * Peşinat giriş olarak kalır. Defterde aynı fişin çıkışı varsa kalan
 * ikinci kez inmez; nakit kolonu yine net tutarı gösterir.
 * Rezervasyon bilgi tutarına eklenmez.
 */
function applyCashRefundsToRegisterRows(
  rows: CashRegisterStatusRow[],
  periodLines: ReadonlyMap<string, CashStatusRegisterLine[]>,
  refunds: readonly CashRegisterRefund[],
  dateFrom: string,
  dateTo: string,
): void {
  if (!refunds.length || !rows.length) return;
  const allLines: CashStatusRegisterLine[] = [];
  for (const lines of periodLines.values()) allLines.push(...lines);
  const seen = new Set<string>();
  const cuts = new Map<string, { cash: number; card: number; transfer: number; unposted: number }>();

  const bucketFor = (id: string) => {
    const current = cuts.get(id) || { cash: 0, card: 0, transfer: 0, unposted: 0 };
    cuts.set(id, current);
    return current;
  };

  for (const refund of refunds) {
    const kind = refundDrawerKind(refund.method);
    if (!kind) continue;
    if (!refundInRange(refund.date, dateFrom, dateTo)) continue;
    const amount = Math.abs(num(refund.amount));
    if (!(amount > 0.004)) continue;
    const fiche = String(refund.ficheNo || '').trim();
    const dedupe = fiche ? `${fiche.toLocaleLowerCase('tr-TR')}|${kind}` : '';
    if (dedupe) {
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
    }
    const row = rowForCashRefund(rows, String(refund.registerId || ''));
    if (!row) continue;
    const cut = bucketFor(row.id);
    if (kind === 'cash') cut.cash = round2(cut.cash + amount);
    else if (kind === 'card') cut.card = round2(cut.card + amount);
    else cut.transfer = round2(cut.transfer + amount);
    if (!refundAlreadyPosted(fiche, allLines)) cut.unposted = round2(cut.unposted + amount);
  }

  for (const row of rows) {
    const cut = cuts.get(row.id);
    if (!cut) continue;
    row.payCash = round2(row.payCash - cut.cash);
    row.todayCash = row.payCash;
    row.payCard = round2(row.payCard - cut.card);
    row.todayCard = row.payCard;
    row.payTransfer = round2(row.payTransfer - cut.transfer);
    row.closingCash = round2(row.closingCash - cut.unposted);
    row.grandTotal = round2(row.payCash + row.payCard + row.payOpen + row.payTransfer);
  }
}

/**
 * Satış iadelerinden kasa çıkışı. Peşinat fişi iade değildir.
 * Veresiye iade kasadan çıkmaz. Aynı fiş bir kez yazılır.
 */
export function cashRefundsFromSales(
  sales: readonly CashRegisterRefundSale[],
  appliedAvansBySaleId?: ReadonlyMap<string, number>,
): CashRegisterRefund[] {
  const out: CashRegisterRefund[] = [];
  const seen = new Set<string>();
  for (const sale of sales || []) {
    if (isDepositSale({
      isDeposit: sale.isDeposit ?? null,
      notes: sale.notes ?? undefined,
    })) continue;
    if (!isReturnSale({ total: Number(sale.total) || 0, status: sale.status } as Parameters<typeof isReturnSale>[0])) continue;
    const id = String(sale.id || '').trim();
    const fiche = String(sale.receiptNumber || '').trim();
    const key = (fiche || id).toLocaleLowerCase('tr-TR');
    if (!key || seen.has(key)) continue;
    const applied = id && appliedAvansBySaleId ? Number(appliedAvansBySaleId.get(id) || 0) : 0;
    const paymentRows = Array.isArray(sale.payments)
      ? sale.payments.filter((row) => row != null).map((row) => ({
        method: String(row.method || ''),
        amount: Number(row.amount) || 0,
        currency: row.currency,
        cash_register_id: row.cash_register_id ?? null,
      }))
      : undefined;
    const split = saleCollectedSplit(
      {
        total: Number(sale.total) || 0,
        paymentMethod: String(sale.paymentMethod ?? ''),
        payments: paymentRows && paymentRows.length > 0 ? paymentRows : undefined,
        discount: sale.discount,
      },
      applied,
    );
    const parts: Array<{ method: 'cash' | 'card' | 'transfer'; amount: number }> = [
      { method: 'cash', amount: split.cash < 0 ? -split.cash : 0 },
      { method: 'card', amount: split.card < 0 ? -split.card : 0 },
      { method: 'transfer', amount: split.transfer < 0 ? -split.transfer : 0 },
    ];
    const alive = parts.filter((part) => part.amount > 0.004);
    if (!alive.length) continue;
    seen.add(key);
    const registerId = String(
      paymentRows?.find((row) => String(row.cash_register_id || '').trim())?.cash_register_id || '',
    ).trim();
    const date = sale.date == null ? '' : String(sale.date);
    for (const part of alive) {
      out.push({
        id,
        ficheNo: fiche,
        amount: round2(part.amount),
        method: part.method,
        registerId: registerId || null,
        date,
      });
    }
  }
  return out;
}

/**
 * Kasalar sekmesi — her kasanın kendi kasa kartı hareketi.
 *
 * Günlük nakit / kart, Kasa Yönetimi tahsilatı ile aynı işaret kuralından
 * (`computeKasaIslemiSign`) ve ödeme yönteminden ayrılır. Aynı satır hem
 * nakde hem karta yazılmaz. Kapanış, aynı formülle kasa bakiyesidir
 * (KALAN). Çıkış bakiyeden düşer. Nakit satış iadesi nakit kolonundan ve
 * kalandan bir kez düşülür; peşinat kasa girişidir, iade sayılmaz.
 * Gider kolonu kasa kartındaki gider fişidir (gider pusulası, kasa çıkış,
 * maaş, avans, cari ödeme). Nakitten bir kez düşülür. Kalan bu çıkışı
 * zaten netliyorsa gider ikinci kez düşülmez. Kayıt yoksa gider 0 kalır
 * ve kalan değiştirilmez. Rezervasyon nakdin içindedir; nakitten ve
 * kalandan tekrar düşülmez, toplama eklenmez. Çek ve senet dağılım
 * satırı değildir.
 * Kasaya bağlanmayan satır ayrı kalır; şirket satış özeti kasaya yapıştırılmaz.
 */
export function cashRegisterStatusFromLedger(args: {
  registers: Array<{ id: string; code?: string | null; name?: string | null }>;
  lines: CashStatusRegisterLine[];
  dateFrom: string;
  dateTo: string;
  unassignedLabel: string;
  /** Satış fişindeki nakit iade. Defter satırı yoksa kalan da bu tutarı düşer. */
  cashRefunds?: readonly CashRegisterRefund[];
  /**
   * Satış fiş numaraları. Fatura aynası (fiş no bu kümede değilse)
   * çekmece bakiyesine ikinci kez yazılmaz.
   */
  saleReceiptKeys?: Iterable<string>;
}): CashRegisterStatusRow[] {
  const dateFrom = String(args.dateFrom || '').slice(0, 10);
  const dateTo = String(args.dateTo || '').slice(0, 10);
  const ledgerLines = withCashVirmanLines(
    withoutDuplicateSaleInvoices(args.lines || [], args.saleReceiptKeys),
  ) as CashStatusRegisterLine[];
  const known = new Set<string>();
  const byId = new Map<string, { code: string; name: string; lines: CashStatusRegisterLine[] }>();

  const ensure = (id: string, code: string, name: string) => {
    const key = id || CASH_REGISTER_UNASSIGNED_ID;
    if (!byId.has(key)) {
      byId.set(key, { code, name: name || code || key, lines: [] });
    }
    return byId.get(key)!;
  };

  for (const register of args.registers) {
    const id = String(register.id || '').trim();
    if (!id) continue;
    known.add(id);
    ensure(id, String(register.code || '').trim(), String(register.name || register.code || id));
  }

  for (const line of ledgerLines) {
    const id = String(line.kasa_id || '').trim() || CASH_REGISTER_UNASSIGNED_ID;
    const row = ensure(
      id,
      '',
      id === CASH_REGISTER_UNASSIGNED_ID ? args.unassignedLabel : id,
    );
    row.lines.push(line);
  }

  const rows: CashRegisterStatusRow[] = [];
  const periodLines = new Map<string, CashStatusRegisterLine[]>();
  for (const [id, bucket] of byId) {
    const before: CashStatusRegisterLine[] = [];
    const through: CashStatusRegisterLine[] = [];
    let cashIn = 0;
    let cardIn = 0;
    let transferIn = 0;
    let openIn = 0;
    let reservationCash = 0;
    let expense = 0;
    let skipNet = 0;
    const otherOut = new Map<string, number>();
    const refunds = args.cashRefunds || [];

    for (const line of bucket.lines) {
      const day = ledgerDay(line.islem_tarihi);
      if (day && dateTo && day > dateTo) continue;
      through.push(line);
      if (day && dateFrom && day < dateFrom) {
        before.push(line);
        continue;
      }
      const signed = signedLedgerAmount(line);
      const kind = drawerKind(line);
      if (kind === 'skip') {
        skipNet = round2(skipNet + signed);
        continue;
      }
      const tipUpper = String(line.islem_tipi || '').trim().toUpperCase();
      if (isCashVirmanType(tipUpper)) {
        // Kaynak −tutar, hedef +tutar. Gider değildir. Toplam satırda birbirini götürür.
        if (kind === 'card') cardIn = round2(cardIn + signed);
        else if (kind === 'transfer') transferIn = round2(transferIn + signed);
        else if (kind === 'open') openIn = round2(openIn + signed);
        else if (kind === 'cash') cashIn = round2(cashIn + signed);
        continue;
      }
      if (signed < -0.004) {
        if (!matchesListedRefund(line, refunds)) {
          const tip = tipUpper || 'DIGER';
          const abs = round2(-signed);
          if (kind === 'cash' && isOperatingCashExpense(line, tip)) {
            expense = round2(expense + abs);
          } else {
            otherOut.set(tip, round2((otherOut.get(tip) || 0) + abs));
          }
        }
        continue;
      }
      if (!(signed > 0.004)) continue;
      if (kind === 'card') {
        cardIn = round2(cardIn + signed);
        continue;
      }
      if (kind === 'transfer') {
        transferIn = round2(transferIn + signed);
        continue;
      }
      if (kind === 'open') {
        openIn = round2(openIn + signed);
        continue;
      }
      cashIn = round2(cashIn + signed);
      if (isReservationCashLine(line)) reservationCash = round2(reservationCash + signed);
    }

    periodLines.set(id, through);
    const openingCash = balanceOf(id, before);
    const closingCash = balanceOf(id, through);
    const otherCashOuts = cashOutSlices(otherOut);
    const otherTotal = round2(otherCashOuts.reduce((sum, slice) => sum + slice.amount, 0));
    const moved = Math.abs(openingCash) + Math.abs(closingCash) + cashIn + cardIn
      + transferIn + openIn + reservationCash + expense + otherTotal + Math.abs(skipNet) > 0.004;
    if (id === CASH_REGISTER_UNASSIGNED_ID && !moved) continue;
    if (!known.has(id) && id !== CASH_REGISTER_UNASSIGNED_ID && !moved) continue;

    rows.push({
      id,
      code: bucket.code,
      name: bucket.name,
      openingCash,
      todayCash: cashIn,
      reservationDeposit: reservationCash,
      todayCard: cardIn,
      closingCash,
      payCash: cashIn,
      payCard: cardIn,
      payOpen: openIn,
      payTransfer: transferIn,
      grandTotal: round2(cashIn + cardIn + openIn + transferIn),
      expense,
      otherCashOuts,
      skipNet,
    });
  }

  applyCashRefundsToRegisterRows(rows, periodLines, args.cashRefunds || [], dateFrom, dateTo);

  rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return rows;
}

/** Kasa Yönetimi kartı: `KASA.001 — MERKEZ KASA`. */
export function formatCashRegisterDistributionLabel(code: string, name: string): string {
  const registerCode = String(code || '').trim();
  const registerName = String(name || '').trim();
  if (registerCode && registerName && registerCode !== registerName) {
    return `${registerCode} — ${registerName}`;
  }
  return registerName || registerCode;
}

export interface CashRegisterDistributionLine {
  id: string;
  code: string;
  name: string;
  /** `KASA.001 — MERKEZ KASA` */
  label: string;
  /**
   * Kasanın içindeki tutar: dönem sonu bakiyesi
   * (`computeCashBalanceForRegister`, dateTo'ya kadar).
   * Nakit ve kart aynı hareketi iki kez saymaz. Rezervasyon bu bakiyenin
   * içindedir; satır tutarına ikinci kez eklenmez.
   */
  amount: number;
}

/**
 * Ödeme dağılımı bloğundaki kasa listesi.
 * Her kasa kartı ayrı satırdır. Kasaya bağlanmayan tutar, defter satırı varsa
 * ayrı satırda kalır. Boş defter boş dizi döner.
 */
export function cashRegisterDistributionLines(
  rows: CashRegisterStatusRow[],
  options?: { unpostedExpense?: number },
): CashRegisterDistributionLine[] {
  const postedExpense = round2(
    (rows || []).reduce((sum, row) => sum + Math.max(0, num(row.expense)), 0),
  );
  const extraExpense = Math.max(0, round2(num(options?.unpostedExpense) - postedExpense));
  let targetId = '';
  let bestCash = -1;
  if (extraExpense > 0.004) {
    for (const row of rows || []) {
      if (row.payCash > bestCash) {
        bestCash = row.payCash;
        targetId = row.id;
      }
    }
  }
  return (rows || []).map((row) => {
    const cut = extraExpense > 0.004 && row.id === targetId ? extraExpense : 0;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      label: formatCashRegisterDistributionLabel(row.code, row.name),
      amount: round2(row.closingCash - cut),
    };
  });
}

export function sumCashRegisterDistribution(lines: CashRegisterDistributionLine[]): number {
  return round2((lines || []).reduce((sum, line) => sum + num(line.amount), 0));
}

export interface CashRegisterDrawerLine {
  id: string;
  code: string;
  name: string;
  label: string;
  /** Dönem içi nakit. Rezervasyon nakdi bunun içindedir. Nakit iade bir kez düşülür. */
  cash: number;
  /** Dönem içi kart. Nakit satırına yazılmaz. */
  card: number;
  openAccount: number;
  transfer: number;
  /** Kasa kartındaki gider fişi. Nakitten bir kez düşülür. Kayıt yoksa 0. */
  expense: number;
  /** Bilgi — nakde dahildir, genel toplama ve kalana eklenmez. */
  reservation: number;
  /** Kalan. Nakit − gider; bakiye zaten net ise gider ikinci kez düşülmez. */
  balance: number;
}

/**
 * Kalan = nakit − gider.
 * Rezervasyon parametresi nakdin içindedir; bu fonksiyonda düşülmez.
 * Gider kaydı yoksa defter bakiyesi olduğu gibi döner.
 * Defter bakiyesi gideri zaten netlediyse tutar ikinci kez düşülmez.
 * Defter henüz brüt ise gider bir kez düşülür.
 */
export function cashRegisterRemaining(args: {
  cash: number;
  expense: number;
  reservation?: number;
  ledgerBalance: number;
}): number {
  const cash = round2(num(args.cash));
  const expense = Math.max(0, round2(num(args.expense)));
  const ledger = round2(num(args.ledgerBalance));
  if (expense <= 0.004) return ledger;
  const net = round2(cash - expense);
  if (Math.abs(ledger - net) <= 0.004) return ledger;
  if (Math.abs(ledger - cash) <= 0.004) return net;
  return ledger;
}

export interface CashRegisterExpenseGap {
  id: string;
  label: string;
  /** Nakit − gider − kalan. Rezervasyon bu farka girmez. */
  gap: number;
  otherCashOuts: CashRegisterCashOutSlice[];
  /**
   * Görünen kart / havale / açık cari, açılış, çek ve gider sayılmayan
   * çıkış açıklandıktan sonra kalan fark. Uydurma gider değildir.
   */
  residual: number;
}

/**
 * Nakit − gider kalanı tutmuyorsa gerçek fark.
 * Açılış, kart, havale ve açık cari görünen kolonlarla açıklanıyorsa satır dönmez.
 * Gider kaydı olmayan çıkış ve sınıflanamayan fark döner.
 */
export function cashRegisterExpenseGaps(rows: CashRegisterStatusRow[]): CashRegisterExpenseGap[] {
  const gaps: CashRegisterExpenseGap[] = [];
  for (const row of rows || []) {
    const cash = round2(row.payCash);
    const expense = Math.max(0, round2(row.expense));
    const balance = cashRegisterRemaining({
      cash,
      expense,
      reservation: row.reservationDeposit,
      ledgerBalance: row.closingCash,
    });
    const gap = round2(cash - expense - balance);
    if (Math.abs(gap) <= 0.004) continue;
    const other = row.otherCashOuts || [];
    const otherTotal = round2(other.reduce((sum, slice) => sum + num(slice.amount), 0));
    const explained = round2(
      otherTotal
      - round2(row.openingCash)
      - round2(row.payCard)
      - round2(row.payTransfer)
      - round2(row.payOpen)
      - round2(row.skipNet),
    );
    const residual = round2(gap - explained);
    if (otherTotal <= 0.004 && Math.abs(residual) <= 0.004) continue;
    gaps.push({
      id: row.id,
      label: formatCashRegisterDistributionLabel(row.code, row.name),
      gap,
      otherCashOuts: other,
      residual,
    });
  }
  return gaps;
}

/**
 * Kasalar sekmesi — kasanın içindeki ödeme kırılımı.
 * Satış fişi özeti değil; `cashRegisterStatusFromLedger` çıktısı.
 * Çek ve senet kolon değildir. Gider kolonu kasa kartı fişidir.
 */
export function cashRegisterDrawerLines(rows: CashRegisterStatusRow[]): CashRegisterDrawerLine[] {
  return (rows || []).map((row) => {
    const cash = round2(row.payCash);
    const expense = round2(row.expense);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      label: formatCashRegisterDistributionLabel(row.code, row.name),
      cash,
      card: round2(row.payCard),
      openAccount: round2(row.payOpen),
      transfer: round2(row.payTransfer),
      expense,
      reservation: round2(row.reservationDeposit),
      balance: cashRegisterRemaining({
        cash,
        expense,
        reservation: row.reservationDeposit,
        ledgerBalance: row.closingCash,
      }),
    };
  });
}

/**
 * Yeşil genel toplam ödeme dağılımıdır. Kasa listesi aynı paranın kasa
 * bakiyesidir; genel toplama ikinci kez eklenmez. Rezervasyon bilgi
 * tutarı `paymentGrand` dışında tutulmuş olmalıdır.
 */
export function cashStatusBlockTotals(
  paymentGrand: number,
  registerRows: CashRegisterStatusRow[],
): { grandTotal: number; registerTotal: number } {
  return {
    grandTotal: round2(num(paymentGrand)),
    registerTotal: sumCashRegisterDistribution(cashRegisterDistributionLines(registerRows)),
  };
}

export type CashStatusMovementFlow = 'gelir' | 'gider';

export type CashStatusMovementMethod = 'nakit' | 'kart' | 'havale';

/** Kategori metni fişte yoksa ekran bu kodu çevirir. */
export type CashStatusMovementCategory =
  | 'sale'
  | 'deposit'
  | 'collection'
  | 'openingDebit'
  | 'openingCredit'
  | 'expense'
  | 'payment'
  | 'virman'
  | 'bankIn'
  | 'bankOut'
  | 'cashIn'
  | 'cashOut'
  | 'other';

export interface CashStatusMovementRow {
  id: string;
  /** İstanbul takvim günü. Üç kutunun aralığıyla aynı gün. */
  date: string;
  flow: CashStatusMovementFlow;
  /** Artı giriş, eksi çıkış. Virman kaynağı eksi, hedefi artı. */
  amount: number;
  method: CashStatusMovementMethod;
  /** Cari, kategori veya virmanda kasa adı. Boşsa kategori kodu gösterilir. */
  party: string;
  description: string;
  categoryCode: CashStatusMovementCategory;
  typeCode: string;
  ficheNo: string;
  registerId: string;
  /**
   * Kasa kartının adı. Ad yoksa kodu.
   * İkisi de yoksa boştur; fiş metninden veya kimlikten ad uydurulmaz.
   */
  registerName: string;
}

export interface CashStatusMovementInput {
  /**
   * Kasa fişleri. Her fiş bir satırdır.
   * Satış nakdi, gider toplamı, indirim ve açık cari buradan satır üretmez.
   */
  lines?: readonly CashStatusRegisterLine[];
  dateFrom?: string;
  dateTo?: string;
  saleReceiptKeys?: Iterable<string>;
  /**
   * Satış nakdi peşinatı zaten içeriyorsa aynı satış fişi ikinci satır olmaz.
   * Toplamın kendisi satır açmaz.
   */
  customerCollectionsInSalesCash?: boolean;
  salesCash?: number;
  reservation?: number;
  discount?: number;
  expense?: number;
  countedExpenseKeys?: Iterable<string> | null;
  /**
   * Kasa kartı adı (`cash_registers.name`), anahtar fişin `register_id` değeri.
   * Virman satırında kategori olarak da durur.
   */
  registerNames?: Readonly<Record<string, string>>;
  /** Kasa kartı kodu. Ad boşsa hareket kolonunda bu yazılır. */
  registerCodes?: Readonly<Record<string, string>>;
}

/**
 * Hareket satırındaki kasa yazısı.
 * Kaynak kasa kartıdır: ad, yoksa kod. Kartta ikisi de yoksa boş.
 * Kimlik, fiş açıklaması ve uydurma etiket yazılmaz.
 */
export function cashMovementRegisterLabel(args: {
  registerId?: string | null;
  name?: string | null;
  code?: string | null;
}): string {
  const id = String(args.registerId || '').trim();
  const name = String(args.name || '').trim();
  if (name && name !== id) return name;
  const code = String(args.code || '').trim();
  if (code && code !== id) return code;
  return '';
}

function movementFicheKey(line: CashStatusRegisterLine): string {
  return receiptKey(line.islem_no) || receiptKey(line.fiche_no);
}

function matchedSaleKey(line: CashStatusRegisterLine, keys: ReadonlySet<string>): string {
  if (keys.size === 0) return '';
  const direct = [line.islem_no, line.fiche_no].map(receiptKey).find((key) => key && keys.has(key));
  if (direct) return direct;
  const blob = [line.islem_aciklamasi, line.aciklama].map(receiptKey).filter(Boolean).join(' ');
  if (!blob) return '';
  for (const key of keys) {
    if (key.length >= 4 && blob.includes(key)) return key;
  }
  return '';
}

function isDiscountMovement(line: CashStatusRegisterLine): boolean {
  const blob = [line.islem_tipi, line.payment_method, line.ozel_kod, line.special_code, line.aciklama]
    .map((value) => String(value || '').trim().toLocaleLowerCase('tr-TR'))
    .join(' ');
  return blob.includes('indirim') || blob.includes('iskonto') || blob.includes('discount');
}

function movementMethod(kind: DrawerKind): CashStatusMovementMethod {
  if (kind === 'card') return 'kart';
  if (kind === 'transfer') return 'havale';
  return 'nakit';
}

function movementParty(line: CashStatusRegisterLine, registerName: string, virman: boolean): string {
  const named = [line.cari_hesap_unvani, line.party_name, line.category, line.kategori]
    .map((value) => String(value || '').trim())
    .find(Boolean);
  if (named) return named;
  if (virman && registerName) return registerName;
  return '';
}

function movementCategory(
  line: CashStatusRegisterLine,
  tip: string,
  virman: boolean,
): CashStatusMovementCategory {
  if (virman) return 'virman';
  const voucherText = cashVoucherText(line);
  if (isSalesReturnCashVoucher(tip, voucherText)) return 'cashOut';
  if (isPurchaseReturnCashVoucher(tip, voucherText)) return 'cashIn';
  if (isReservationCashLine(line)) return 'deposit';
  if (tip === 'ACILIS_BORC' || tip === 'ACILIS') return 'openingDebit';
  if (tip === 'ACILIS_ALACAK') return 'openingCredit';
  if (tip === 'CH_ODEME' || tip === 'ALIS_FATURASI') return 'payment';
  if (tip === 'BANKADAN_CEKILEN') return 'bankIn';
  if (tip === 'BANKA_YATIRILAN') return 'bankOut';
  if (isOperatingCashExpense(line, tip)) return 'expense';
  if (tip === 'CH_TAHSILAT') return 'collection';
  if (SALE_INVOICE_COLLECTION_TYPES.has(tip) || looksLikeAutoSaleCashIn(line, tip)) return 'sale';
  if (tip === 'KASA_GIRIS') return 'cashIn';
  return 'other';
}

function movementPreference(line: CashStatusRegisterLine, tip: string): number {
  let score = 0;
  if (
    tip === 'KASA_GIRIS'
    || tip === 'KASA_CIKIS'
    || tip === 'CH_TAHSILAT'
    || tip === 'CH_ODEME'
    || tip === 'GIDER_PUSULASI'
    || tip === 'ACILIS_BORC'
    || tip === 'ACILIS_ALACAK'
    || tip === 'BANKA_YATIRILAN'
    || tip === 'BANKADAN_CEKILEN'
  ) {
    score += 30;
  }
  if (SALE_INVOICE_COLLECTION_TYPES.has(tip) || tip === 'ALIS_FATURASI') score -= 15;
  return score;
}

/**
 * Rezervasyon tahsilatı ayrı bir kasa satırıdır.
 * Satış fişiyle aynı numara veya açıklamadaki satış numarası bu satırı yutmaz.
 * Aynı fiş ve aynı tutarın ikinci aynası bir kez durur.
 */
function reservationMovementKey(line: CashStatusRegisterLine): string {
  const abs = round2(Math.abs(num(line.tutar))).toFixed(2);
  const fiche = movementFicheKey(line);
  if (fiche) return `deposit:${fiche}|${abs}`;
  const id = receiptKey(line.id);
  if (id) return `deposit-id:${id}`;
  const day = ledgerDay(line.islem_tarihi);
  const registerId = String(line.kasa_id || '').trim();
  const desc = receiptKey(line.islem_aciklamasi || line.aciklama);
  return `deposit:${day}|${registerId}|${desc}|${abs}`;
}

function movementGroupKey(
  line: CashStatusRegisterLine,
  tip: string,
  saleKeys: ReadonlySet<string>,
  collectionsInSales: boolean,
): string {
  void collectionsInSales;
  if (isReservationCashLine(line)) return reservationMovementKey(line);
  const fiche = movementFicheKey(line);
  if (fiche) return `fis:${fiche}`;
  const matched = matchedSaleKey(line, saleKeys);
  if (matched) return `fis:${matched}`;
  const id = receiptKey(line.id);
  if (id) return `id:${id}`;
  const day = ledgerDay(line.islem_tarihi);
  const registerId = String(line.kasa_id || '').trim();
  const desc = receiptKey(line.islem_aciklamasi || line.aciklama);
  return `anon:${day}|${tip}|${registerId}|${desc}|${round2(Math.abs(num(line.tutar))).toFixed(2)}`;
}

function registerCaption(
  line: CashStatusRegisterLine,
  names: Readonly<Record<string, string>> | undefined,
  codes: Readonly<Record<string, string>> | undefined,
): string {
  const id = String(line.kasa_id || '').trim();
  return cashMovementRegisterLabel({
    registerId: id,
    name: id ? names?.[id] : '',
    code: id ? codes?.[id] : '',
  });
}

function toMovementRow(
  line: CashStatusRegisterLine,
  names: Readonly<Record<string, string>> | undefined,
  codes: Readonly<Record<string, string>> | undefined,
  groupKey: string,
): CashStatusMovementRow | null {
  const signed = round2(voucherSignedAmount(line));
  if (!(Math.abs(signed) > 0.004)) return null;
  const tip = String(line.islem_tipi || '').trim().toUpperCase();
  const virman = isCashVirmanType(tip);
  const kind = drawerKind(line);
  const registerId = String(line.kasa_id || '').trim();
  const registerName = registerCaption(line, names, codes);
  const ficheNo = String(line.islem_no || line.fiche_no || '').trim();
  const flow: CashStatusMovementFlow = signed > 0 ? 'gelir' : 'gider';
  return {
    id: `${groupKey}|${registerId}|${flow}|${ficheNo}`,
    date: ledgerDay(line.islem_tarihi),
    flow,
    amount: signed,
    method: movementMethod(kind),
    party: movementParty(line, registerName, virman),
    description: String(line.islem_aciklamasi || line.aciklama || '').trim(),
    categoryCode: movementCategory(line, tip, virman),
    typeCode: tip,
    ficheNo,
    registerId,
    registerName,
  };
}

/**
 * Kasa Durumu hareket listesi.
 *
 * Aralık, üç kutunun aralığıdır: filtresizken 1 Ocak–bugün, seçilince yalnız o günler.
 * Aralık dışındaki fiş yoktur. Her kasa fişi bir satırdır.
 * Giriş Gelir ve artı, çıkış Gider ve eksidir.
 * Açılış alacak eksi Gider, açılış borç artı Gelirdir.
 * Virman kaynakta eksi, hedefte artı listelenir; üç kutunun giren ve çıkanına yazılmaz.
 * Rezervasyon tahsilatı kasaya giren ayrı satırdır. Satış fişi kalan hizmet tutarıdır.
 * Aynı fiş numarası peşinatı gizlemez. Aynı fiş ve aynı tutarın ikinci aynası bir kez durur.
 * Ciro listesi kapanmış peşinatı gizleyebilir. Kasa hareket listesi gizlemez.
 * Gider bir kez ve eksidir. İndirim satırı ve açık cari uydurulmaz.
 * Satış nakdi, gider toplamı ve indirim parametresi satır açmaz.
 */
export function cashStatusMovementRows(input: CashStatusMovementInput): CashStatusMovementRow[] {
  void input.salesCash;
  void input.reservation;
  void input.discount;
  void input.expense;
  void input.countedExpenseKeys;
  const dateFrom = String(input.dateFrom || '').slice(0, 10);
  const dateTo = String(input.dateTo || '').slice(0, 10);
  const saleKeys = saleReceiptKeySet(input.saleReceiptKeys);
  const collectionsInSales = input.customerCollectionsInSalesCash === true;
  const lines = withCashVirmanLines(input.lines || []) as CashStatusRegisterLine[];
  const names = input.registerNames;
  const codes = input.registerCodes;

  const virman: CashStatusRegisterLine[] = [];
  const grouped = new Map<string, { line: CashStatusRegisterLine; score: number; abs: number }>();

  for (const line of lines) {
    const day = ledgerDay(line.islem_tarihi);
    if (day && dateFrom && day < dateFrom) continue;
    if (day && dateTo && day > dateTo) continue;
    if (isDiscountMovement(line)) continue;
    const signed = voucherSignedAmount(line);
    if (!(Math.abs(signed) > 0.004)) continue;
    const kind = drawerKind(line);
    if (kind === 'skip' || kind === 'open') continue;
    const tip = String(line.islem_tipi || '').trim().toUpperCase();
    if (isCashVirmanType(tip)) {
      virman.push(line);
      continue;
    }
    const key = movementGroupKey(line, tip, saleKeys, collectionsInSales);
    const score = movementPreference(line, tip);
    const abs = Math.abs(signed);
    const current = grouped.get(key);
    if (!current || score > current.score || (score === current.score && abs > current.abs + 0.004)) {
      grouped.set(key, { line, score, abs });
    }
  }

  const rows: CashStatusMovementRow[] = [];
  for (const [key, picked] of grouped) {
    const row = toMovementRow(picked.line, names, codes, key);
    if (row) rows.push(row);
  }
  virman.forEach((line, index) => {
    const row = toMovementRow(line, names, codes, `virman:${index}`);
    if (row) rows.push(row);
  });

  rows.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    const byFiche = a.ficheNo.localeCompare(b.ficheNo, 'tr');
    if (byFiche !== 0) return byFiche;
    return a.registerId.localeCompare(b.registerId, 'tr');
  });
  return rows;
}

/**
 * Seçili aralıkta kasaya gerçekten giren ve çıkan nakit.
 * Hareket listesiyle aynı fişler. Satış tutarı satır açmaz.
 * Peşinat kendi satırıyla bir kez girer. Satış fişi bu tutarı yutmaz.
 * Virman şirket bakiyesini değiştirmez. Açılış alacak çıkandır.
 * İndirim ve açık cari yazılmaz. Kasa satırı olmayan gider çıkan olmaz.
 */
export function ledgerCashPeriodFlow(input: {
  lines?: readonly CashStatusRegisterLine[];
  dateFrom?: string;
  dateTo?: string;
  saleReceiptKeys?: Iterable<string>;
}): { totalIn: number; totalOut: number; priorBalance: number } {
  const dateFrom = String(input.dateFrom || '').slice(0, 10);
  const dateTo = String(input.dateTo || '').slice(0, 10);
  const lines = (input.lines || []) as CashStatusRegisterLine[];
  let priorBalance = 0;
  for (const line of lines) {
    const day = ledgerDay(line.islem_tarihi);
    if (day && dateTo && day > dateTo) continue;
    if (!(day && dateFrom && day < dateFrom)) continue;
    const tip = String(line.islem_tipi || '').trim().toUpperCase();
    if (isCashVirmanType(tip)) continue;
    if (drawerKind(line) !== 'cash') continue;
    const signed = voucherSignedAmount(line);
    if (Math.abs(signed) > 0.004) priorBalance = round2(priorBalance + signed);
  }
  const movements = cashStatusMovementRows({
    lines,
    dateFrom,
    dateTo,
    saleReceiptKeys: input.saleReceiptKeys,
    customerCollectionsInSalesCash: true,
  });
  let totalIn = 0;
  let totalOut = 0;
  for (const row of movements) {
    if (row.categoryCode === 'virman') continue;
    if (row.amount > 0.004) totalIn = round2(totalIn + row.amount);
    else if (row.amount < -0.004) totalOut = round2(totalOut + Math.abs(row.amount));
  }
  return {
    totalIn,
    totalOut,
    priorBalance: round2(priorBalance),
  };
}

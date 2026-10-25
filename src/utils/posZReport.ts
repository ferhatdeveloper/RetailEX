import type { Sale } from '../core/types';
import {
  cancelledUnclosedReservationBox,
  type CancelledReservationBoxInput,
} from './cancelledReservationBox';
import { formatNumber } from './formatNumber';
import { integerSharePercents } from './sharePercent';
import { localCalendarDateKey } from './localCalendarDate';
import { saleCollectedSplit } from './saleCollectedAmounts';
import { isDepositSale } from './reportDepositFilter';

export interface PosPaymentBreakdown {
  cash: number;
  card: number;
  credit: number;
  other: number;
  cashCount: number;
  cardCount: number;
  creditCount: number;
  otherCount: number;
}

export interface PosZReport {
  dateLabel: string;
  dateKey: string;
  totalSales: number;
  amountBeforeDiscount: number;
  totalDiscount: number;
  refundAmount: number;
  totalAmount: number;
  cashAmount: number;
  cardAmount: number;
  creditAmount: number;
  otherAmount: number;
  canceledSales: number;
  firstSale: string;
  lastSale: string;
  payments: PosPaymentBreakdown;
  cashierStats: CashierDayStats[];
}

export interface CashierDayStats {
  name: string;
  salesCount: number;
  grossRevenue: number;
  returnTotal: number;
  netRevenue: number;
  cashTotal: number;
  cardTotal: number;
  creditTotal: number;
  otherTotal: number;
}

export function isReturnSale(sale: Sale): boolean {
  const status = String(sale.status ?? '').toLowerCase();
  return Number(sale.total) < 0 || status === 'refunded' || status === 'return';
}

export function isCanceledSale(sale: Sale): boolean {
  const status = String(sale.status ?? '').toLowerCase();
  return status === 'cancelled' || status === 'canceled';
}

function addSplitToBreakdown(result: PosPaymentBreakdown, sale: Sale): void {
  const split = saleCollectedSplit(sale);
  const cash = Math.abs(Number(split.cash) || 0);
  const card = Math.abs(Number(split.card) || 0);
  const credit = Math.abs(Number(split.credit) || 0);
  const other = Math.abs(Number(split.transfer) || 0);
  if (cash > 1e-9) {
    result.cash += cash;
    result.cashCount += 1;
  }
  if (card > 1e-9) {
    result.card += card;
    result.cardCount += 1;
  }
  if (credit > 1e-9) {
    result.credit += credit;
    result.creditCount += 1;
  }
  if (other > 1e-9) {
    result.other += other;
    result.otherCount += 1;
  }
}

/** Satışlardan ödeme kırılımı — belge tutarı değil tahsilat (saleCollectedSplit) */
export function aggregatePosPayments(sales: Sale[]): PosPaymentBreakdown {
  const result: PosPaymentBreakdown = {
    cash: 0,
    card: 0,
    credit: 0,
    other: 0,
    cashCount: 0,
    cardCount: 0,
    creditCount: 0,
    otherCount: 0,
  };

  for (const sale of sales) {
    if (isReturnSale(sale) || isCanceledSale(sale)) continue;
    const total = Math.abs(Number(sale.total) || 0);
    if (!(total > 0)) continue;
    // Bug 28 — Rezervasyon peşinatı (is_deposit=true) açık hesap (credit) veya
    // diğer ödeme kırılımlarına YAZILMAZ. Bu satış zaten kasa tahsilinde ayrı
    // bir "Peşinat" kovasında toplanıyor; cari bakiye ise peşinat kabul edilmez.
    if (isDepositSale(sale)) continue;
    addSplitToBreakdown(result, sale);
  }

  return result;
}

/** Satış iade fişlerinden ödeme kırılımı (nakit iade kasadan düşülür) */
export function aggregateReturnPayments(sales: Sale[]): PosPaymentBreakdown {
  const result: PosPaymentBreakdown = {
    cash: 0,
    card: 0,
    credit: 0,
    other: 0,
    cashCount: 0,
    cardCount: 0,
    creditCount: 0,
    otherCount: 0,
  };

  for (const sale of sales) {
    if (!isReturnSale(sale) || isCanceledSale(sale)) continue;
    const total = Math.abs(Number(sale.total) || 0);
    if (!(total > 0)) continue;
    addSplitToBreakdown(result, sale);
  }

  return result;
}

function addSplitToCashierStats(stats: CashierDayStats, sale: Sale): void {
  const split = saleCollectedSplit(sale);
  stats.cashTotal += Math.abs(Number(split.cash) || 0);
  stats.cardTotal += Math.abs(Number(split.card) || 0);
  stats.creditTotal += Math.abs(Number(split.credit) || 0);
  stats.otherTotal += Math.abs(Number(split.transfer) || 0);
}

/** Gün sonu — kasiyer / personel bazlı ciro özeti */
export function aggregateCashierPerformance(
  sales: Sale[],
  dateKey = localCalendarDateKey(new Date()),
  opts?: { dateTo?: string; prefiltered?: boolean },
): CashierDayStats[] {
  const daySales = opts?.prefiltered
    ? sales
    : opts?.dateTo
      ? sales.filter((s) => {
        const k = localCalendarDateKey(s.date);
        return k >= dateKey && k <= opts.dateTo!;
      })
      : sales.filter((s) => localCalendarDateKey(s.date) === dateKey);
  const map = new Map<string, CashierDayStats>();

  const ensure = (rawName: string): CashierDayStats => {
    const name = rawName.trim() || 'Bilinmeyen Kasiyer';
    const existing = map.get(name);
    if (existing) return existing;
    const created: CashierDayStats = {
      name,
      salesCount: 0,
      grossRevenue: 0,
      returnTotal: 0,
      netRevenue: 0,
      cashTotal: 0,
      cardTotal: 0,
      creditTotal: 0,
      otherTotal: 0,
    };
    map.set(name, created);
    return created;
  };

  for (const sale of daySales) {
    if (isCanceledSale(sale)) continue;
    const stats = ensure(String(sale.cashier || ''));

    if (isReturnSale(sale)) {
      const ret = Math.abs(Number(sale.total) || 0);
      stats.returnTotal += ret;
      stats.netRevenue = stats.grossRevenue - stats.returnTotal;
      continue;
    }

    const total = Math.abs(Number(sale.total) || 0);
    if (!(total > 0)) continue;

    stats.salesCount += 1;
    stats.grossRevenue += total;

    addSplitToCashierStats(stats, sale);

    stats.netRevenue = stats.grossRevenue - stats.returnTotal;
  }

  return Array.from(map.values()).sort((a, b) => b.netRevenue - a.netRevenue);
}

function summarizePosZReportFromDaySales(
  daySales: Sale[],
  dateLabel: string,
  dateKey: string,
  dateTo?: string,
): PosZReport {
  const activeSales = daySales.filter((s) => !isCanceledSale(s));
  const positiveSales = activeSales.filter((s) => !isReturnSale(s));
  const returnSales = daySales.filter((s) => isReturnSale(s) && !isCanceledSale(s));

  const totalAmount = positiveSales.reduce((sum, s) => sum + Math.abs(Number(s.total) || 0), 0);
  const totalDiscount = positiveSales.reduce((sum, s) => sum + Math.abs(Number(s.discount) || 0), 0);
  const refundAmount = returnSales.reduce((sum, s) => sum + Math.abs(Number(s.total) || 0), 0);
  const payments = aggregatePosPayments(positiveSales);
  const returnPayments = aggregateReturnPayments(returnSales);
  const cashierStats = aggregateCashierPerformance(daySales, dateKey, {
    prefiltered: true,
    ...(dateTo && dateTo !== dateKey ? { dateTo } : {}),
  });

  const sorted = [...positiveSales].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const netPayments: PosPaymentBreakdown = {
    ...payments,
    cash: Math.max(0, payments.cash - returnPayments.cash),
    card: Math.max(0, payments.card - returnPayments.card),
    credit: Math.max(0, payments.credit - returnPayments.credit),
    other: Math.max(0, payments.other - returnPayments.other),
  };

  return {
    dateLabel,
    dateKey,
    totalSales: positiveSales.length,
    amountBeforeDiscount: totalAmount + totalDiscount,
    totalDiscount,
    refundAmount,
    totalAmount,
    cashAmount: netPayments.cash,
    cardAmount: netPayments.card,
    creditAmount: netPayments.credit,
    otherAmount: netPayments.other,
    canceledSales: daySales.filter((s) => isCanceledSale(s)).length,
    firstSale: sorted.length > 0 ? String(sorted[0].receiptNumber || '-') : '-',
    lastSale: sorted.length > 0 ? String(sorted[sorted.length - 1].receiptNumber || '-') : '-',
    payments: netPayments,
    cashierStats,
  };
}

export function buildPosZReport(sales: Sale[], dateKey = localCalendarDateKey(new Date())): PosZReport {
  const daySales = sales.filter((s) => localCalendarDateKey(s.date) === dateKey);
  const dateLabel = new Date(`${dateKey}T12:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return summarizePosZReportFromDaySales(daySales, dateLabel, dateKey);
}

/** Günlük rapor / gün aralığı Z özeti */
export function buildPosZReportForRange(
  sales: Sale[],
  dateFrom: string,
  dateTo: string,
  dateLabel: string,
): PosZReport {
  const inRange = (s: Sale) => {
    const k = localCalendarDateKey(s.date);
    return k >= dateFrom && k <= dateTo;
  };
  const daySales = sales.filter(inRange);
  const dateKey = dateFrom === dateTo ? dateFrom : dateFrom;
  return summarizePosZReportFromDaySales(daySales, dateLabel, dateKey, dateTo);
}

/** Sonradan CH_TAHSILAT (satış satırında yok) — cebe nakit, belge tutarı değil. */
export function applyExtraCashCollections(report: PosZReport, extraCash: number): PosZReport {
  const extra = Math.max(0, Number(extraCash) || 0);
  if (!(extra > 1e-9)) return report;
  return {
    ...report,
    cashAmount: report.cashAmount + extra,
    creditAmount: Math.max(0, report.creditAmount - extra),
    payments: {
      ...report.payments,
      cash: report.payments.cash + extra,
      credit: Math.max(0, report.payments.credit - extra),
    },
  };
}

export function posZCollectedAmount(report: Pick<PosZReport, 'cashAmount' | 'cardAmount' | 'otherAmount'>): number {
  return (
    (Number(report.cashAmount) || 0) +
    (Number(report.cardAmount) || 0) +
    (Number(report.otherAmount) || 0)
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface DayEndZReservationInput {
  /**
   * Kasa durumundaki rezervasyon nakdi (REZERVASYON_AVANS).
   * İşaret korunur: iade eksi kalır. Ciroya eklenmez.
   */
  reservationCash: number;
  /** Henüz faturası kesilmemiş randevu. Yoksa 0. */
  openGross?: number;
  openPending?: number;
  openDeposit?: number;
  openCount?: number;
}

export interface DayEndZTotals {
  netSales: number;
  /** Ciro − gider. Rezervasyon tutarı eklenmez. */
  netAfterExpenses: number;
  /** Kasadaki nakit. Rezervasyon zaten içindeyse ikinci kez eklenmez. */
  cashAmount: number;
  /** Bilgi. Net ciroya ve gider sonrası nete yazılmaz. */
  reservationDeposit: number;
  reservationGross: number;
  reservationPending: number;
  reservationCount: number;
}

/**
 * Eski bilgi kolonu. Z ekranı bunu kullanmaz.
 * Ekran satırları `composeDayEndZStatement` ve günlük rapor kutusudur.
 *
 * Rezervasyon peşinatı kazanılmamış avanstır: kasa durumundaki rezervasyon
 * nakdiyle aynı tutar bilgi kolonunda durur. Net ciro ve gider sonrası net
 * bu tutarı ikinci kez almaz. Nakit, çağıranın verdiği kasa tutarıdır
 * (rezervasyon dahilse bir kez).
 *
 * Açık randevu varsa brüt ve kalan o randevunun gerçek tutarıdır.
 * Hizmet ciroya girmişse (açık brüt yok) bilgi brütü alınan peşinatın
 * kendisidir; kalan 0'dır — peşinat kasadadır, ayrıca borç yazılmaz.
 */
export function composeDayEndZTotals(input: {
  netSales: number;
  totalExpenses?: number;
  subtractExpenses?: boolean;
  cashAmount: number;
  reservation: DayEndZReservationInput;
}): DayEndZTotals {
  const netSales = round2(Number(input.netSales) || 0);
  const expenses = input.subtractExpenses === false ? 0 : (Number(input.totalExpenses) || 0);
  const cashAmount = round2(Number(input.cashAmount) || 0);
  const src = input.reservation || { reservationCash: 0 };
  const signedCash = Number(src.reservationCash) || 0;
  const openGross = Math.max(0, Number(src.openGross) || 0);
  const openPending = Math.max(0, Number(src.openPending) || 0);
  const openDeposit = Math.max(0, Number(src.openDeposit) || 0);
  const openCount = Math.max(0, Math.trunc(Number(src.openCount) || 0));

  const deposit = Math.abs(signedCash) > 0.004 ? round2(signedCash) : round2(openDeposit);
  const gross = openGross > 0.004 ? round2(openGross) : round2(deposit);
  const pending = openGross > 0.004 ? round2(openPending) : 0;
  const count = openCount > 0 ? openCount : (Math.abs(deposit) > 0.004 ? 1 : 0);

  return {
    netSales,
    netAfterExpenses: round2(netSales - expenses),
    cashAmount,
    reservationDeposit: deposit,
    reservationGross: gross,
    reservationPending: pending,
    reservationCount: count,
  };
}

export interface DayEndZStatement {
  transactionCount: number;
  grossSales: number;
  discount: number;
  salesReturn: number;
  expense: number;
  /** Brüt − indirim − iade − gider. Her tenzil bir kez. */
  netSales: number;
  /** Açık veya iptal peşinat. Kapanmış randevu 0. */
  reservationAmount: number;
  /** Net satış + rezervasyon. İade ve gider ikinci kez düşülmez. */
  netCash: number;
}

/**
 * Gün sonu Z ekranı.
 * Net satış = brüt satış − indirim − satış iadesi − gider.
 * İndirim açık cari değildir; yalnız bu tenzildir.
 * Net nakit = net satış + rezervasyon tutarı.
 * Rezervasyon, günlük raporun `cancelledUnclosedReservationBox` kutusu.
 * Kimlik fiş / randevu kimliğidir. Müşteri adı küme anahtarı değildir.
 * Kapanmış peşinat hizmet satışının içindedir; satırda 0 kalır ve net nakde eklenmez.
 * İptal peşinatı iade değildir.
 */
export function composeDayEndZStatement(input: {
  transactionCount?: number;
  grossSales: number;
  discount?: number;
  salesReturn?: number;
  expense?: number;
  reservation?: CancelledReservationBoxInput | null;
}): DayEndZStatement {
  const grossSales = round2(Number(input.grossSales) || 0);
  const discount = round2(Math.abs(Number(input.discount) || 0));
  const salesReturn = round2(Math.abs(Number(input.salesReturn) || 0));
  const expense = round2(Math.abs(Number(input.expense) || 0));
  const netSales = round2(grossSales - discount - salesReturn - expense);
  const reservationAmount = round2(
    cancelledUnclosedReservationBox(input.reservation || {}).amount,
  );
  const netCash = round2(netSales + reservationAmount);
  return {
    transactionCount: Math.max(0, Math.trunc(Number(input.transactionCount) || 0)),
    grossSales,
    discount,
    salesReturn,
    expense,
    netSales,
    reservationAmount,
    netCash,
  };
}

export interface DayEndZDateRange {
  from: string;
  to: string;
  /** Kullanıcı en az bir sınır yazdı. */
  custom: boolean;
}

/**
 * Boş aralık mevcut dönemi bırakır.
 * Tek taraf boşsa o taraf dönemden gelir.
 * Başlangıç bitişten büyükse yer değiştirir.
 */
export function resolveDayEndZDateRange(
  overrideFrom: string,
  overrideTo: string,
  periodFrom: string,
  periodTo: string,
): DayEndZDateRange {
  const fromRaw = String(overrideFrom || '').trim();
  const toRaw = String(overrideTo || '').trim();
  if (!fromRaw && !toRaw) {
    return { from: periodFrom, to: periodTo, custom: false };
  }
  let from = fromRaw || periodFrom;
  let to = toRaw || periodTo;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to, custom: true };
}

export interface DayEndZRangeExpense {
  date: string;
  amount: number;
}

function datedInRange(raw: string | null | undefined, dateFrom: string, dateTo: string): boolean {
  const key = localCalendarDateKey(raw || '');
  if (!key) return true;
  return key >= dateFrom && key <= dateTo;
}

/** Aralık dışındaki gider toplama girmez. Tarihsiz satır dönem yüklemesinde kalır. */
export function sumExpensesInRange(
  expenses: readonly DayEndZRangeExpense[] | null | undefined,
  dateFrom: string,
  dateTo: string,
): number {
  let sum = 0;
  for (const row of expenses || []) {
    if (!datedInRange(row.date, dateFrom, dateTo)) continue;
    sum += Math.abs(Number(row.amount) || 0);
  }
  return round2(sum);
}

/** Aralık dışındaki randevu, avans ve peşinat fişi rezervasyon kutusuna girmez. */
export function clipReservationToDayEndRange(
  input: CancelledReservationBoxInput | null | undefined,
  dateFrom: string,
  dateTo: string,
): CancelledReservationBoxInput {
  const src = input || {};
  return {
    ...src,
    appointments: (src.appointments || []).filter((row) =>
      datedInRange(row.appointment_date || row.appointmentDate || row.date, dateFrom, dateTo),
    ),
    avansRows: (src.avansRows || []).filter((row) =>
      datedInRange(row.created_at || row.createdAt, dateFrom, dateTo),
    ),
    depositSales: (src.depositSales || []).filter((row) =>
      datedInRange(row.date || row.created_at, dateFrom, dateTo),
    ),
  };
}

export interface DayEndZRangeStatement extends DayEndZStatement {
  cashierStats: CashierDayStats[];
}

/**
 * Seçilen aralığın fişleri.
 * Aralık dışı fiş brüt, iade ve kasiyer toplamına girmez.
 * Net satış = brüt − indirim − iade − gider. Net nakit = net satış + rezervasyon.
 */
export function composeDayEndZStatementForRange(input: {
  sales: Sale[];
  expenses?: readonly DayEndZRangeExpense[] | null;
  dateFrom: string;
  dateTo: string;
  dateLabel?: string;
  reservation?: CancelledReservationBoxInput | null;
}): DayEndZRangeStatement {
  const base = buildPosZReportForRange(
    input.sales,
    input.dateFrom,
    input.dateTo,
    input.dateLabel || '',
  );
  const statement = composeDayEndZStatement({
    transactionCount: base.totalSales,
    grossSales: base.amountBeforeDiscount,
    discount: base.totalDiscount,
    salesReturn: base.refundAmount,
    expense: sumExpensesInRange(input.expenses, input.dateFrom, input.dateTo),
    reservation: clipReservationToDayEndRange(input.reservation, input.dateFrom, input.dateTo),
  });
  return {
    ...statement,
    cashierStats: base.cashierStats,
  };
}

/** Pasta dilimi. Brüt, net nakit ve işlem sayısı bu kümede yoktur. */
export const DAY_END_Z_PIE_SLICE_ORDER = [
  'netSales',
  'reservation',
  'salesReturn',
  'expense',
  'discount',
] as const;

export type DayEndZPieSliceKey = (typeof DAY_END_Z_PIE_SLICE_ORDER)[number];

export interface DayEndZPieSlice {
  key: DayEndZPieSliceKey;
  amount: number;
  /** Sıfır ve negatif tutar pastada yer kaplamaz. Açıklamada 0 kalabilir. */
  inChart: boolean;
  /** Dilim tutarı / grafikteki dilimlerin toplamı. Grafik dışı dilimde 0. */
  sharePercent: number;
}

/** Net satış yeşil, rezervasyon turuncu, iade kırmızı, gider bordo, indirim mor. */
export const DAY_END_Z_PIE_COLORS: Record<DayEndZPieSliceKey, string> = {
  netSales: '#15803d',
  reservation: '#ea580c',
  salesReturn: '#dc2626',
  expense: '#9f1239',
  discount: '#7c3aed',
};

/**
 * Günün birbirine eklenmeyen parçaları.
 * Dilimler toplanıp brüt, net satış veya net nakit edilmez.
 * Net satış zaten indirim, iade ve gider düşülmüş tutardır.
 * İndirim yalnız sıfırdan büyükse dilim olur. İşlem sayısı dilim değildir.
 */
export function buildDayEndZPieSlices(
  statement: Pick<DayEndZStatement, 'netSales' | 'reservationAmount' | 'salesReturn' | 'expense' | 'discount'>,
): DayEndZPieSlice[] {
  const amountOf: Record<DayEndZPieSliceKey, number> = {
    netSales: round2(Number(statement.netSales) || 0),
    reservation: round2(Number(statement.reservationAmount) || 0),
    salesReturn: round2(Number(statement.salesReturn) || 0),
    expense: round2(Number(statement.expense) || 0),
    discount: round2(Number(statement.discount) || 0),
  };
  const drafts = DAY_END_Z_PIE_SLICE_ORDER.map((key) => {
    const amount = amountOf[key];
    return { key, amount, inChart: amount > 0.004 };
  });
  const percents = integerSharePercents(drafts.map((slice) => (slice.inChart ? slice.amount : 0)));
  return drafts.map((slice, index) => ({
    ...slice,
    sharePercent: slice.inChart ? percents[index] : 0,
  }));
}

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printPosZReport(
  report: PosZReport,
  options?: { companyName?: string; cashier?: string; openingCash?: number; actualCash?: number },
): void {
  const company = escHtml(options?.companyName || 'RetailOS');
  const cashier = options?.cashier ? escHtml(options.cashier) : '';
  const { payments, cashierStats } = report;

  const cashierRowsHtml = cashierStats.length > 0
    ? `
      <div class="divider"></div>
      <div class="section-title">KASİYER / PERSONEL CİROSU</div>
      ${cashierStats.map((c) => `
        <div class="row"><span class="bold">${escHtml(c.name)}</span><span>${c.salesCount} fiş</span></div>
        <div class="row"><span>Brüt ciro</span><span>${formatNumber(c.grossRevenue, 2, false)}</span></div>
        <div class="row"><span>İade (-)</span><span>${formatNumber(c.returnTotal, 2, false)}</span></div>
        <div class="row"><span>Net ciro</span><span>${formatNumber(c.netRevenue, 2, false)}</span></div>
        <div class="row"><span>Nakit / Kart</span><span>${formatNumber(c.cashTotal, 2, false)} / ${formatNumber(c.cardTotal, 2, false)}</span></div>
        <div class="divider"></div>
      `).join('')}
    `
    : '';

  const reportHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Z Raporu - ${escHtml(report.dateLabel)}</title>
      <style>
        html { width: 80mm; max-width: 80mm; margin: 0; padding: 0; }
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { width: 80mm !important; max-width: 80mm !important; margin: 0 !important; }
        }
        body {
          box-sizing: border-box;
          width: 100%;
          max-width: 80mm;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          line-height: 1.3;
          padding: 5mm;
          margin: 0;
          color: #000;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .large { font-size: 14px; }
        .divider { border-top: 1px dashed #000; margin: 3mm 0; }
        .row { display: flex; justify-content: space-between; margin: 1mm 0; gap: 2mm; }
        .row span:last-child { text-align: right; white-space: nowrap; }
        .section-title { text-align: center; font-weight: 700; margin: 1mm 0 2mm; }
        .final { border-top: 1px solid #000; padding-top: 1.2mm; margin-top: 1.2mm; font-size: 13px; font-weight: 700; }
      </style>
    </head>
    <body>
      <div class="center bold large">Z RAPORU</div>
      <div class="center">${company}</div>
      <div class="divider"></div>
      <div class="row"><span>Tarih:</span><span class="bold">${escHtml(report.dateLabel)}</span></div>
      <div class="row"><span>Saat:</span><span>${new Date().toLocaleTimeString('tr-TR')}</span></div>
      ${cashier ? `<div class="row"><span>Kasiyer:</span><span>${cashier}</span></div>` : ''}
      <div class="divider"></div>
      <div class="section-title">SATIŞ ÖZETİ</div>
      <div class="row"><span>Toplam İşlem:</span><span>${report.totalSales}</span></div>
      <div class="row"><span>Brüt Satış:</span><span>${formatNumber(report.amountBeforeDiscount, 2, false)}</span></div>
      <div class="row"><span>İndirim (-):</span><span>${formatNumber(report.totalDiscount, 2, false)}</span></div>
      <div class="row"><span>İade (-):</span><span>${formatNumber(report.refundAmount, 2, false)}</span></div>
      <div class="row"><span>İptal Adet:</span><span>${report.canceledSales}</span></div>
      <div class="row"><span>İlk Fiş:</span><span>${escHtml(report.firstSale)}</span></div>
      <div class="row"><span>Son Fiş:</span><span>${escHtml(report.lastSale)}</span></div>
      <div class="divider"></div>
      <div class="section-title">TAHSİLAT KIRILIMI</div>
      <div class="row"><span>Nakit (${payments.cashCount}):</span><span>${formatNumber(report.cashAmount, 2, false)}</span></div>
      <div class="row"><span>Kart (${payments.cardCount}):</span><span>${formatNumber(report.cardAmount, 2, false)}</span></div>
      <div class="row"><span>Veresiye/Cari (${payments.creditCount}):</span><span>${formatNumber(report.creditAmount, 2, false)}</span></div>
      <div class="row"><span>Diğer (${payments.otherCount}):</span><span>${formatNumber(report.otherAmount, 2, false)}</span></div>
      <div class="row final"><span>TOPLAM TAHSİLAT</span><span>${formatNumber(posZCollectedAmount(report), 2, false)}</span></div>
      ${cashierRowsHtml}
      ${
        options?.openingCash != null
          ? `
      <div class="divider"></div>
      <div class="section-title">KASA</div>
      <div class="row"><span>Açılış:</span><span>${formatNumber(options.openingCash, 2, false)}</span></div>
      <div class="row"><span>Nakit Tahsilat:</span><span>${formatNumber(report.cashAmount, 2, false)}</span></div>
      ${
        options.actualCash != null
          ? `<div class="row"><span>Sayılan:</span><span>${formatNumber(options.actualCash, 2, false)}</span></div>`
          : ''
      }
      `
          : ''
      }
      <div class="divider"></div>
      <div class="center" style="font-size:9px;">RetailOS POS Z Raporu</div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'width=400,height=700');
  if (!printWindow) return;
  printWindow.document.write(reportHTML);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 300);
}

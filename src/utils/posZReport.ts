import type { Sale } from '../core/types';
import { formatNumber } from './formatNumber';
import { localCalendarDateKey } from './localCalendarDate';
import { saleCollectedSplit } from './saleCollectedAmounts';

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

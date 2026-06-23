import type { Sale } from '../core/types';
import { formatNumber } from './formatNumber';
import { localCalendarDateKey } from './localCalendarDate';

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

function normalizePaymentMethod(raw: unknown): 'cash' | 'card' | 'credit' | 'other' {
  const pm = String(raw ?? '').toLowerCase().trim();
  if (!pm || pm === 'cash' || pm === 'nakit') return 'cash';
  if (pm === 'card' || pm === 'kart' || pm === 'kredi kartı' || pm === 'gateway' || pm === 'kredi') return 'card';
  if (pm === 'veresiye' || pm === 'credit' || pm === 'cari' || pm === 'borç' || pm === 'borc') return 'credit';
  return 'other';
}

export function isReturnSale(sale: Sale): boolean {
  const status = String(sale.status ?? '').toLowerCase();
  return Number(sale.total) < 0 || status === 'refunded' || status === 'return';
}

export function isCanceledSale(sale: Sale): boolean {
  const status = String(sale.status ?? '').toLowerCase();
  return status === 'cancelled' || status === 'canceled';
}

/** Satışlardan ödeme kırılımı — payments[] varsa satır satır, yoksa paymentMethod */
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

    const rows = (sale as Sale & { payments?: Array<{ method?: string; amount?: number; currency?: string }> }).payments;
    if (Array.isArray(rows) && rows.length > 0) {
      const exchangeRates: Record<string, number> = { IQD: 1, USD: 1310, EUR: 1450 };
      for (const row of rows) {
        const amount = Math.abs(Number(row.amount) || 0) * (exchangeRates[String(row.currency || 'IQD').toUpperCase()] || 1);
        if (!(amount > 0)) continue;
        const bucket = normalizePaymentMethod(row.method);
        result[bucket] += amount;
        result[`${bucket}Count` as keyof PosPaymentBreakdown] = (result[`${bucket}Count` as keyof PosPaymentBreakdown] as number) + 1;
      }
      continue;
    }

    const bucket = normalizePaymentMethod(sale.paymentMethod);
    result[bucket] += total;
    result[`${bucket}Count` as keyof PosPaymentBreakdown] = (result[`${bucket}Count` as keyof PosPaymentBreakdown] as number) + 1;
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

    const rows = (sale as Sale & { payments?: Array<{ method?: string; amount?: number; currency?: string }> }).payments;
    if (Array.isArray(rows) && rows.length > 0) {
      const exchangeRates: Record<string, number> = { IQD: 1, USD: 1310, EUR: 1450 };
      for (const row of rows) {
        const amount = Math.abs(Number(row.amount) || 0) * (exchangeRates[String(row.currency || 'IQD').toUpperCase()] || 1);
        if (!(amount > 0)) continue;
        const bucket = normalizePaymentMethod(row.method);
        result[bucket] += amount;
        result[`${bucket}Count` as keyof PosPaymentBreakdown] = (result[`${bucket}Count` as keyof PosPaymentBreakdown] as number) + 1;
      }
      continue;
    }

    const bucket = normalizePaymentMethod(sale.paymentMethod);
    result[bucket] += total;
    result[`${bucket}Count` as keyof PosPaymentBreakdown] = (result[`${bucket}Count` as keyof PosPaymentBreakdown] as number) + 1;
  }

  return result;
}

function addPaymentToCashierStats(
  stats: CashierDayStats,
  sale: Sale,
  amount: number,
  method?: string,
): void {
  const bucket = normalizePaymentMethod(method ?? sale.paymentMethod);
  if (bucket === 'cash') stats.cashTotal += amount;
  else if (bucket === 'card') stats.cardTotal += amount;
  else if (bucket === 'credit') stats.creditTotal += amount;
  else stats.otherTotal += amount;
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

    const paymentRows = (sale as Sale & { payments?: Array<{ method?: string; amount?: number; currency?: string }> }).payments;
    if (Array.isArray(paymentRows) && paymentRows.length > 0) {
      const exchangeRates: Record<string, number> = { IQD: 1, USD: 1310, EUR: 1450 };
      for (const row of paymentRows) {
        const amt = Math.abs(Number(row.amount) || 0) * (exchangeRates[String(row.currency || 'IQD').toUpperCase()] || 1);
        if (amt > 0) addPaymentToCashierStats(stats, sale, amt, row.method);
      }
    } else {
      addPaymentToCashierStats(stats, sale, total);
    }

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
      <div class="row final"><span>TOPLAM TAHSİLAT</span><span>${formatNumber(report.totalAmount, 2, false)}</span></div>
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

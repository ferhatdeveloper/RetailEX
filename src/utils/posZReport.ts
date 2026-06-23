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
}

function normalizePaymentMethod(raw: unknown): 'cash' | 'card' | 'credit' | 'other' {
  const pm = String(raw ?? '').toLowerCase().trim();
  if (!pm || pm === 'cash' || pm === 'nakit') return 'cash';
  if (pm === 'card' || pm === 'kart' || pm === 'kredi kartı' || pm === 'gateway' || pm === 'kredi') return 'card';
  if (pm === 'veresiye' || pm === 'credit' || pm === 'cari' || pm === 'borç' || pm === 'borc') return 'credit';
  return 'other';
}

function isReturnSale(sale: Sale): boolean {
  const status = String(sale.status ?? '').toLowerCase();
  return Number(sale.total) < 0 || status === 'refunded' || status === 'return';
}

function isCanceledSale(sale: Sale): boolean {
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

export function buildPosZReport(sales: Sale[], dateKey = localCalendarDateKey(new Date())): PosZReport {
  const daySales = sales.filter((s) => localCalendarDateKey(s.date) === dateKey);
  const activeSales = daySales.filter((s) => !isCanceledSale(s));
  const positiveSales = activeSales.filter((s) => !isReturnSale(s));
  const returnSales = daySales.filter((s) => isReturnSale(s));

  const totalAmount = positiveSales.reduce((sum, s) => sum + Math.abs(Number(s.total) || 0), 0);
  const totalDiscount = positiveSales.reduce((sum, s) => sum + Math.abs(Number(s.discount) || 0), 0);
  const refundAmount = returnSales.reduce((sum, s) => sum + Math.abs(Number(s.total) || 0), 0);
  const payments = aggregatePosPayments(positiveSales);

  const sorted = [...positiveSales].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const dateLabel = new Date(`${dateKey}T12:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return {
    dateLabel,
    dateKey,
    totalSales: positiveSales.length,
    amountBeforeDiscount: totalAmount + totalDiscount,
    totalDiscount,
    refundAmount,
    totalAmount,
    cashAmount: payments.cash,
    cardAmount: payments.card,
    creditAmount: payments.credit,
    otherAmount: payments.other,
    canceledSales: daySales.filter((s) => isCanceledSale(s)).length,
    firstSale: sorted.length > 0 ? String(sorted[0].receiptNumber || '-') : '-',
    lastSale: sorted.length > 0 ? String(sorted[sorted.length - 1].receiptNumber || '-') : '-',
    payments,
  };
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
  const { payments } = report;

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

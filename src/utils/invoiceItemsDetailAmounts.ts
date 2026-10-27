/**
 * Fatura kalem detayı — satır iskonto, net fatura toplamı, fatura türü.
 *
 * Muhasebe:
 *  - Brüt = birim fiyat × miktar (iade satırında miktar eksi, brüt eksi).
 *  - Net = satır net_amount. İskonto bu netten ikinci kez düşülmez.
 *  - İskonto = brüt − net. Kayıtlı tutar veya yüzde bu farkla aynıysa o kaynak kullanılır.
 *  - Fatura toplam kolonu satır netidir. Başlık total_net brüttür (iskonto öncesi ara toplam)
 *    ve çok kalemde satır sayısı kadar toplanmaz.
 *  - Dip toplam satır netlerinin toplamıdır. Grup alt toplamı satır dizisi boş gelse de
 *    önceden hesaplanan toplam (sum) kullanılır; 0 yazılmaz.
 */
import { formatReportDateCell } from './dateLocale';
import { signInvoiceDetailAmounts } from './reportReturnCashSign';

export type InvoiceItemsDetailTypeLabels = {
  sales: string;
  purchase: string;
  salesReturn: string;
  purchaseReturn: string;
  serviceGiven: string;
  serviceReceived: string;
  waybill: string;
  order: string;
  quote: string;
};

/** Mevcut fiş adları. Yeni tür uydurulmaz. */
export const INVOICE_ITEMS_DETAIL_TYPE_LABELS_TR: InvoiceItemsDetailTypeLabels = {
  sales: 'Satış Faturası',
  purchase: 'Alış Faturası',
  salesReturn: 'Satış İade Faturası',
  purchaseReturn: 'Alış İade Faturası',
  serviceGiven: 'Verilen Hizmet Faturası',
  serviceReceived: 'Alınan Hizmet Faturası',
  waybill: 'İrsaliye',
  order: 'Sipariş',
  quote: 'Satış Teklifi',
};

const PURCHASE_TRCODES = new Set([1, 5, 13, 26, 41, 42]);

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normFiche(ficheType: unknown): string {
  return String(ficheType ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Fiş türü sales.fiche_type + sales.trcode.
 * Logo: 2/3 satış iade, 6 alış iade, 4 alınan hizmet, 9 verilen hizmet.
 */
export function invoiceItemsDetailTypeLabel(
  ficheType: unknown,
  trcode: unknown,
  labels: InvoiceItemsDetailTypeLabels = INVOICE_ITEMS_DETAIL_TYPE_LABELS_TR,
): string {
  const ft = normFiche(ficheType);
  const tc = num(trcode);

  if (tc === 6 || ((ft === 'return_invoice' || ft === 'i') && PURCHASE_TRCODES.has(tc))) {
    return labels.purchaseReturn;
  }
  if (tc === 2 || tc === 3 || ft === 'return_invoice' || ft === 'i') {
    return labels.salesReturn;
  }
  if (tc === 4) return labels.serviceReceived;
  if (tc === 9 || ft === 'service' || ft === 'hizmet') return labels.serviceGiven;
  if (ft === 'waybill' || ft === 'irsaliye') return labels.waybill;
  if (ft === 'order' || ft === 'siparis') return labels.order;
  if (ft === 'quote' || ft === 'teklif') return labels.quote;
  if (ft === 'purchase_invoice' || ft === 'a' || PURCHASE_TRCODES.has(tc)) {
    return labels.purchase;
  }
  return labels.sales;
}

/**
 * İskonto tutarı. Satır neti doğru kabul edilir; brütten bir kez fark alınır.
 * Yüzde (discount_rate) tutara çevrilir. 100'den büyük oran tutar sanılıp yüzde yapılmaz.
 */
export function invoiceLineDiscountFromGrossNet(input: {
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountAmount?: number;
  discountRate?: number;
}): number {
  const qty = num(input.quantity);
  const price = num(input.unitPrice);
  const net = num(input.lineTotal);
  const gross = price * qty;
  const gap = gross - net;
  if (Math.abs(gap) <= 0.009) return 0;

  const absGap = Math.abs(gap);
  const sign = gap < 0 ? -1 : 1;
  const stored = Math.abs(num(input.discountAmount));
  const tolerance = Math.max(0.05, absGap * 0.02);

  if (stored > 0.009 && Math.abs(stored - absGap) <= tolerance) {
    return sign * roundMoney(stored);
  }

  const rate = Math.abs(num(input.discountRate));
  if (rate > 0.0001 && rate <= 100) {
    const fromRate = Math.abs(gross) * (rate / 100);
    if (fromRate > 0.009 && Math.abs(fromRate - absGap) <= tolerance) {
      return sign * roundMoney(fromRate);
    }
  }

  return roundMoney(gap);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type InvoiceItemsDetailAmountInput = {
  quantity: number;
  unitPrice: number;
  /** sale_items.total_amount — çoğu fişte net ile aynı yazılır, brüt sayılmaz. */
  lineGross: number;
  /** sale_items.net_amount — indirim sonrası satır neti. */
  lineTotal: number;
  discountAmount?: number;
  discountRate?: number;
  isReturn: boolean;
  /**
   * sales.total_net. Ara toplamdır (iskonto düşülmemiş). Kolona yazılmaz.
   * Çok kalemde satır sayısı kadar çarpılmasın diye yok sayılır.
   */
  headerTotalNet?: number;
};

export function mapInvoiceItemsDetailAmounts(input: InvoiceItemsDetailAmountInput): {
  quantity: number;
  unitPrice: number;
  lineGross: number;
  lineTotal: number;
  discount: number;
  invoiceTotal: number;
} {
  const signed = signInvoiceDetailAmounts(
    {
      quantity: num(input.quantity),
      lineGross: num(input.lineGross),
      lineTotal: num(input.lineTotal),
      invoiceTotal: num(input.lineTotal),
    },
    input.isReturn,
  );
  const unitPrice = num(input.unitPrice);
  const discount = invoiceLineDiscountFromGrossNet({
    quantity: signed.quantity,
    unitPrice,
    lineTotal: signed.lineTotal,
    discountAmount: input.discountAmount,
    discountRate: input.discountRate,
  });
  const lineGross = roundMoney(unitPrice * signed.quantity);
  return {
    quantity: signed.quantity,
    unitPrice,
    lineGross,
    lineTotal: signed.lineTotal,
    discount,
    invoiceTotal: signed.lineTotal,
  };
}

/**
 * Fatura Toplam dip toplamı.
 * Gruplama, format fonksiyonuna boş satır dizisi verebilir; o zaman `sum`
 * (satır netlerinin toplamı) gösterilir. Dolu dizide de satır neti toplanır,
 * başlık tutarı değil.
 */
export function invoiceItemsDetailInvoiceFooterSum(
  sum: number,
  rows: ReadonlyArray<{ lineTotal?: number }>,
): number {
  if (!rows || rows.length === 0) {
    return roundMoney(num(sum));
  }
  let total = 0;
  for (const row of rows) total += num(row.lineTotal);
  return roundMoney(total);
}

export const INVOICE_ITEMS_DETAIL_EXPORT_HEADERS = [
  'No',
  'Tarih',
  'Fatura No',
  'Fatura Türü',
  'Müşteri',
  'Ürün',
  'Miktar',
  'Birim Fiyat',
  'İskonto',
  'Satır Toplam',
  'Fatura Toplam',
  'Telefon',
] as const;

export function invoiceItemsDetailExportCells(row: {
  date: string;
  invoiceNo: string;
  invoiceType: string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  invoiceTotal: number;
  phone: string;
}, index: number): string[] {
  return [
    String(index + 1),
    formatReportDateCell(row.date, null, { fallback: row.date || '' }),
    row.invoiceNo,
    row.invoiceType,
    row.customerName,
    row.productName,
    String(row.quantity),
    String(row.unitPrice),
    String(row.discount),
    String(row.lineTotal),
    String(row.invoiceTotal),
    row.phone,
  ];
}

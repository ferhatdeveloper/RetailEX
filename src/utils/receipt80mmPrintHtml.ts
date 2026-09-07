/**
 * Receipt80mm ile aynı 80mm fiş düzeni — doğrudan yazıcıya giden HTML (Tauri / iframe print).
 * Önizleme modalındaki görünümle hizalı satır düzeni, kesik çizgiler, ödeme blokları, barkod.
 */
import type { Sale, SaleItem } from '../core/types/models';
import { RECEIPT_80MM_DOCUMENT_CSS, RECEIPT_80MM_VIEWPORT_FOR_HEADLESS } from './receipt80mmDocumentCss';
import type { ReceiptSettings } from '../services/receiptSettingsService';
import { formatNumber } from './formatNumber';
import { formatCurrency, formatMoneyWithCode, getGlobalCurrency, getCurrencyDecimalPlaces, moneyEpsilon } from './currency';
import { receiptNotesForDisplay } from './receiptNotes';
import { beautyReceiptStaffNames, isBeautyReceiptSale } from './beautyReceiptLayout';
import { getPrintString, resolvePrintLocale, type SupportedPrintLocale } from '../locales/printKeys';
/** Receipt80mm / POS fiş dili */
export type Receipt80mmPrintLocale = 'tr' | 'en' | 'ar' | 'ku' | 'uz';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatReceiptDate(iso: string, locale: Receipt80mmPrintLocale): string {
  const d = new Date(iso);
  const loc =
    locale === 'ar'
      ? 'ar-SA'
      : locale === 'ku'
        ? 'ku-IQ'
        : locale === 'en'
          ? 'en-GB'
          : locale === 'uz'
            ? 'uz-UZ'
            : 'tr-TR';
  return `${d.toLocaleDateString(loc)} ${d.toLocaleTimeString(loc)}`;
}

type RText = {
  receiptNo: string;
  date: string;
  cashier: string;
  customer: string;
  table: string;
  device: string;
  staff: string;
  operation: string;
  productLabel: string;
  qtyLabel: string;
  amountLabel: string;
  subtotal: string;
  discount: string;
  campaign: string;
  total: string;
  paymentDetails: string;
  paid: string;
  change: string;
  remaining: string;
  thanks: string;
  footerLine: string;
  cash: string;
  card: string;
  veresiye: string;
  qr: string;
  treatmentDegree: string;
  treatmentShots: string;
  noteLabel: string;
};

const TEXT: Record<Receipt80mmPrintLocale, RText> = {
  tr: {
    receiptNo: 'FİŞ NO',
    date: 'TARİH',
    cashier: 'KASİYER',
    customer: 'MÜŞTERİ',
    table: 'MASA',
    device: 'CİHAZ',
    staff: 'PERSONEL',
    operation: 'İŞLEM',
    productLabel: 'Ürün',
    qtyLabel: 'Adet',
    amountLabel: 'Tutar',
    subtotal: 'ARA TOPLAM',
    discount: 'İNDİRİM',
    campaign: 'KAMPANYA',
    total: 'TOPLAM',
    paymentDetails: 'ÖDEME DETAYLARI',
    paid: 'ÖDENEN',
    change: 'PARA ÜSTÜ',
    remaining: 'KALAN',
    thanks: 'Bizi Tercih Ettiğiniz İçin Teşekkürler',
    footerLine: 'Profesyonel ERP Çözümleri',
    cash: 'Nakit',
    card: 'Kart',
    veresiye: 'Veresiye',
    qr: 'QR',
    treatmentDegree: 'Derece',
    treatmentShots: 'Atış',
    noteLabel: 'NOT',
  },
  en: {
    receiptNo: 'RECEIPT NO',
    date: 'DATE',
    cashier: 'CASHIER',
    customer: 'CUSTOMER',
    table: 'TABLE',
    device: 'DEVICE',
    staff: 'STAFF',
    operation: 'SERVICE',
    productLabel: 'Item',
    qtyLabel: 'Qty',
    amountLabel: 'Amt',
    subtotal: 'SUBTOTAL',
    discount: 'DISCOUNT',
    campaign: 'CAMPAIGN',
    total: 'TOTAL',
    paymentDetails: 'PAYMENT DETAILS',
    paid: 'PAID',
    change: 'CHANGE',
    remaining: 'REMAINING',
    thanks: 'Thank You For Choosing Us',
    footerLine: 'Professional ERP Solutions',
    cash: 'Cash',
    card: 'Card',
    veresiye: 'Credit',
    qr: 'QR',
    treatmentDegree: 'Degree',
    treatmentShots: 'Shots',
    noteLabel: 'NOTE',
  },
  ar: {
    receiptNo: 'رقم الإيصال',
    date: 'التاريخ',
    cashier: 'الكاشير',
    customer: 'العميل',
    table: 'طاولة',
    device: 'الجهاز',
    staff: 'الموظف',
    operation: 'الخدمة',
    productLabel: 'الصنف',
    qtyLabel: 'العدد',
    amountLabel: 'المبلغ',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    campaign: 'الحملة',
    total: 'الإجمالي',
    paymentDetails: 'تفاصيل الدفع',
    paid: 'المدفوع',
    change: 'الباقي',
    remaining: 'المتبقي',
    thanks: 'شكراً لاختياركم لنا',
    footerLine: 'حلول ERP احترافية',
    cash: 'نقد',
    card: 'بطاقة',
    veresiye: 'آجل',
    qr: 'QR',
    treatmentDegree: 'الدرجة',
    treatmentShots: 'الطلقات',
    noteLabel: 'ملاحظة',
  },
  ku: {
    receiptNo: 'ژ. پسوولە',
    date: 'بەروار',
    cashier: 'کاشێر',
    customer: 'کڕیار',
    table: 'مێز',
    device: 'ئامێر',
    staff: 'ستاف',
    operation: 'خزمەت',
    productLabel: 'بەرهەم',
    qtyLabel: 'ژمارە',
    amountLabel: 'بڕ',
    subtotal: 'کۆی ناوەند',
    discount: 'داشکاندن',
    campaign: 'کەمپەین',
    total: 'کۆی گشتی',
    paymentDetails: 'وردەکارییەکانی پارەدان',
    paid: 'پارەدراو',
    change: 'گەڕاوە',
    remaining: 'ماوە',
    thanks: 'سپاس بۆ هەڵبژاردنمان',
    footerLine: 'چارەسەری ERPی پرۆفیشناڵ',
    cash: 'نەقد',
    card: 'کارت',
    veresiye: 'قەرز',
    qr: 'QR',
    treatmentDegree: 'پلە',
    treatmentShots: 'تەقینەوە',
    noteLabel: 'تێبینی',
  },
  uz: {
    receiptNo: 'CHEK №',
    date: 'SANA',
    cashier: 'KASSIR',
    customer: 'MIJOZ',
    table: 'STOL',
    device: 'QURILMA',
    staff: 'XODIM',
    operation: 'XIZMAT',
    productLabel: 'Mahsulot',
    qtyLabel: 'Soni',
    amountLabel: 'Summa',
    subtotal: 'ORALIQ JAMI',
    discount: 'CHEGIRMA',
    campaign: 'AKSIYA',
    total: 'JAMI',
    paymentDetails: "TO'LOV TAFSILOTLARI",
    paid: "TO'LANGAN",
    change: 'QAYTIM',
    remaining: 'QOLDIQ',
    thanks: 'Bizni tanlaganingiz uchun rahmat',
    footerLine: 'Professional ERP yechimlari',
    cash: 'Naqd',
    card: 'Karta',
    veresiye: 'Nasiya',
    qr: 'QR',
    treatmentDegree: 'Daraja',
    treatmentShots: 'Zarba',
    noteLabel: 'IZOH',
  },
};

function paymentLabel(method: string, T: RText): string {
  let m = method;
  if (m === 'gateway') m = 'card';
  if (m === 'cash') return `💵 ${T.cash}`;
  if (m === 'card') return `💳 ${T.card}`;
  if (m === 'veresiye') return `📋 ${T.veresiye}`;
  return `📱 ${T.qr}`;
}

function itemSubline(item: SaleItem, decimals: number): string {
  const mult = (item as any).multiplier && (item as any).multiplier > 1 ? (item as any).multiplier : 1;
  const unit = (item as any).unit || '';
  const basePrice = mult > 1 ? item.price / mult : item.price;
  const showDecimals = decimals > 0;
  if (mult > 1 && unit) {
    return `${item.quantity} ${unit} × ${formatNumber(basePrice, decimals, showDecimals)}`;
  }
  return `${item.quantity} × ${formatNumber(item.price, decimals, showDecimals)}`;
}

function resolveReceiptDeviceName(sale: Sale): string {
  const beautyDevice = typeof (sale as any).beautyDeviceName === 'string' ? (sale as any).beautyDeviceName.trim() : '';
  if (beautyDevice) return beautyDevice;
  const rawDevice =
    (typeof (sale as any).deviceName === 'string' && (sale as any).deviceName.trim())
    || (typeof (sale as any).device_name === 'string' && (sale as any).device_name.trim())
    || (typeof (sale as any).deviceId === 'string' && (sale as any).deviceId.trim())
    || (typeof (sale as any).device_id === 'string' && (sale as any).device_id.trim())
    || (typeof sale.storeId === 'string' && sale.storeId.trim());
  return rawDevice || '';
}

export type Receipt80mmPrintPaymentData = {
  payments: Array<{ method: string; amount: number; currency: string }>;
  totalPaid: number;
  change: number;
  remaining?: number;
};

export type BuildReceipt80mmPrintHtmlInput = {
  sale: Sale;
  paymentData: Receipt80mmPrintPaymentData;
  receiptSettings: ReceiptSettings;
  /** Ayarlarda isim yoksa (ör. güzellik taslak) */
  companyNameFallback?: string;
  /** Alt satır — seçili firma unvanı */
  firmTitle?: string;
  /** Fiş tutarları için ana para birimi (firma ayarı) */
  currencyCode?: string;
  locale?: Receipt80mmPrintLocale;
  /** Doluysa üstte kesik çizgili bant (örn. ön hesap / taslak) */
  interimBanner?: string | null;
};

/**
 * Receipt80mm önizlemesiyle aynı blok düzeni — yazıcı HTML’i.
 */
export function buildReceipt80mmPrintHtml(input: BuildReceipt80mmPrintHtmlInput): string {
  const {
    sale,
    paymentData,
    receiptSettings,
    companyNameFallback = 'RetailEX',
    firmTitle = '',
    currencyCode,
    locale: localeIn = 'tr',
    interimBanner,
  } = input;

  const baseCurrency = (currencyCode?.trim().toUpperCase() || getGlobalCurrency());
  const moneyDecimals = getCurrencyDecimalPlaces(baseCurrency);
  const fmtMoney = (amount: number) => formatCurrency(amount, undefined, false);
  const fmtPayment = (amount: number, currency?: string) => {
    const code = (currency || baseCurrency).trim().toUpperCase();
    return code === baseCurrency ? fmtMoney(amount) : formatMoneyWithCode(amount, code);
  };

  const locale: Receipt80mmPrintLocale =
    localeIn === 'tr' ||
    localeIn === 'en' ||
    localeIn === 'ar' ||
    localeIn === 'ku' ||
    localeIn === 'uz'
      ? localeIn
      : 'tr';
  const supported: SupportedPrintLocale = (locale as SupportedPrintLocale);
  const t = (key: Parameters<typeof getPrintString>[1]) => getPrintString(supported, key);
  const T = {
    receiptNo: t('invoiceNo'),
    date: t('date'),
    cashier: 'Kasiyer',
    customer: t('customer'),
    table: t('table'),
    device: 'Cihaz',
    staff: 'Personel',
    operation: 'İşlem',
    productLabel: t('itemName'),
    qtyLabel: t('itemCount'),
    amountLabel: t('lineTotal'),
    subtotal: t('subtotal'),
    discount: t('discount'),
    campaign: 'Kampanya',
    total: t('total'),
    paymentDetails: t('cashVoucherHeader'),
    paid: t('paid'),
    change: t('change'),
    remaining: 'Kalan',
    thanks: t('thankYou'),
    footerLine: 'Profesyonel ERP Çözümleri',
    cash: 'Nakit',
    card: 'Kart',
    veresiye: t('credit'),
    qr: 'QR',
    treatmentDegree: 'Derece',
    treatmentShots: 'Atış',
    noteLabel: t('orderNote'),
  };
  const isRTL = locale === 'ar' || locale === 'ku';
  const dir = isRTL ? 'rtl' : 'ltr';
  const ta = isRTL ? 'right' : 'left';

  const companyName =
    receiptSettings.companyName?.trim() || companyNameFallback.trim() || 'RetailEX';
  const logoTrim = receiptSettings.logoDataUrl && String(receiptSettings.logoDataUrl).trim();
  const logoSafe =
    logoTrim && logoTrim.startsWith('data:image/') ? logoTrim : undefined;
  const logoHtml = logoSafe
    ? `<div style="display:flex;justify-content:center;margin-bottom:4px"><img src=${JSON.stringify(logoSafe)} alt="" style="height:40px;max-width:60mm;width:auto;object-fit:contain" /></div>`
    : '';

  const isBeautyReceipt = isBeautyReceiptSale(sale);
  const beautyStaffList = beautyReceiptStaffNames(sale);
  const addr = receiptSettings.companyAddress?.trim();
  const phone = receiptSettings.companyPhone?.trim();
  const hasAddr = !!(addr || phone);
  const addrBlock = hasAddr
    ? `<div style="font-size:10px;font-weight:600;line-height:1.25;margin-top:4px">${addr ? `<div style="word-break:break-word">${escapeHtml(addr)}</div>` : ''}${phone ? `<div>${escapeHtml(phone)}</div>` : ''}</div>`
    : `<div style="font-size:10px;font-weight:600">${escapeHtml(T.footerLine)}</div>`;

  const titleLine = firmTitle.trim()
    ? `<div style="font-size:10px;font-weight:600;margin-top:4px">${escapeHtml(firmTitle.trim())}</div>`
    : '';

  const bannerHtml =
    interimBanner?.trim()
      ? `<div style="text-align:center;font-size:11px;font-weight:800;margin:10px 0;padding:8px;border:2px dashed #000">${escapeHtml(interimBanner.trim())}</div>`
      : '';

  const dateStr = formatReceiptDate(sale.date, locale);
  const retailSkip =
    sale.customerName === 'Perakende Müşteri' || sale.customerName === 'Retail Customer';

  const deviceRow = resolveReceiptDeviceName(sale);
  const degVal = (sale.beautyTreatmentDegree ?? '').trim();
  const shotsVal = (sale.beautyTreatmentShots ?? '').trim();
  const notePlain = receiptNotesForDisplay(sale.notes);
  const notesBlockHtml = notePlain
    ? `<div style="font-size:10px;font-weight:700;line-height:1.35;margin:8px 0 4px;word-break:break-word;padding-top:6px;border-top:1px dashed #6b7280">
  <div style="font-weight:800;margin-bottom:3px">${escapeHtml(T.noteLabel)}</div>
  <div style="font-weight:600;white-space:pre-wrap">${escapeHtml(notePlain)}</div>
</div>`
    : '';

  const discBlock =
    sale.discount > 0
      ? `<div style="display:flex;justify-content:space-between;font-size:10px;color:#b91c1c;font-weight:700;margin:2px 0"><span>${escapeHtml(T.discount)}:</span><span>-${escapeHtml(fmtMoney(sale.discount))}</span></div>`
      : '';

  const payments = paymentData.payments || [];
  const payLines = payments
    .map((payment) => {
      const left = paymentLabel(payment.method, T);
      const payCode = (payment.currency || baseCurrency).trim().toUpperCase();
      const right = fmtPayment(payment.amount ?? 0, payCode);
      return `<div style="display:flex;justify-content:space-between;font-size:10px;margin:4px 0;padding-${isRTL ? 'right' : 'left'}:8px"><span>${left}${payCode !== baseCurrency ? ` (${escapeHtml(payCode)})` : ''}</span><span>${escapeHtml(right)}</span></div>`;
    })
    .join('');

  const remaining = paymentData.remaining ?? 0;
  const remainingBlock =
    remaining > moneyEpsilon(baseCurrency)
      ? `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:800;margin-top:6px"><span>${escapeHtml(T.remaining)}:</span><span>${escapeHtml(fmtMoney(remaining))}</span></div>`
      : '';

  const changeBlock =
    paymentData.change > moneyEpsilon(baseCurrency)
      ? `<div style="display:flex;justify-content:space-between;font-weight:800;color:#15803d;margin-top:8px;font-size:11px"><span>${escapeHtml(T.change)}:</span><span>${escapeHtml(fmtMoney(paymentData.change))}</span></div>`
      : '';

  let bodyInner: string;

  if (isBeautyReceipt) {
    const beautyPhoneOnly = phone
      ? `<div style="font-size:10px;font-weight:600;margin-top:4px">${escapeHtml(phone)}</div>`
      : '';

    const metaRowsHtml: string[] = [];
    metaRowsHtml.push(
      `<tr><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:800;vertical-align:top;text-align:${ta}">${escapeHtml(T.date)}</td><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:700;vertical-align:top;text-align:end">${escapeHtml(dateStr)}</td></tr>`
    );
    metaRowsHtml.push(
      `<tr><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:800;vertical-align:top;text-align:${ta}">${escapeHtml(T.receiptNo)}</td><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:900;vertical-align:top;text-align:end;word-break:break-all">${escapeHtml(sale.receiptNumber)}</td></tr>`
    );
    if (sale.customerName) {
      metaRowsHtml.push(
        `<tr><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:800;vertical-align:top;text-align:${ta}">${escapeHtml(T.customer)}</td><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:900;font-size:14px;vertical-align:top;text-align:end;word-break:break-word">${escapeHtml(sale.customerName)}</td></tr>`
      );
    }
    metaRowsHtml.push(
      `<tr><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:800;vertical-align:top;text-align:${ta}">${escapeHtml(T.staff)}</td><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:700;vertical-align:top;text-align:end;word-break:break-word">${escapeHtml(beautyStaffList.length > 0 ? beautyStaffList.join(', ') : '—')}</td></tr>`
    );
    if (deviceRow) {
      metaRowsHtml.push(
        `<tr><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:800;vertical-align:top;text-align:${ta}">${escapeHtml(T.device)}</td><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:700;vertical-align:top;text-align:end;word-break:break-word">${escapeHtml(deviceRow)}</td></tr>`
      );
    }
    if (degVal) {
      metaRowsHtml.push(
        `<tr><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:800;vertical-align:top;text-align:${ta}">${escapeHtml(T.treatmentDegree)}</td><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:700;vertical-align:top;text-align:end;font-variant-numeric:tabular-nums">${escapeHtml(degVal)}</td></tr>`
      );
    }
    if (shotsVal) {
      metaRowsHtml.push(
        `<tr><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:800;vertical-align:top;text-align:${ta}">${escapeHtml(T.treatmentShots)}</td><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;font-weight:700;vertical-align:top;text-align:end;font-variant-numeric:tabular-nums">${escapeHtml(shotsVal)}</td></tr>`
      );
    }

    const beautyNotesHtml = notePlain
      ? `<div style="font-size:10px;font-weight:700;line-height:1.35;margin:0 0 10px;word-break:break-word">
  <div style="font-weight:800;margin-bottom:3px">${escapeHtml(T.noteLabel)}</div>
  <div style="font-weight:600;white-space:pre-wrap">${escapeHtml(notePlain)}</div>
</div>`
      : '';

    const beautyItemRows = (sale.items || [])
      .map((item) => {
        const sub = itemSubline(item, moneyDecimals);
        const lineStaff = item.beautyStaffName?.trim();
        const showLineStaff = beautyStaffList.length > 1 && !!lineStaff;
        return `<tr>
<td style="padding:7px 2px;border-bottom:1px solid #d1d5db;vertical-align:top;text-align:${ta};word-break:break-word">
<div style="font-weight:800;font-size:12px">${escapeHtml(item.productName || '')}</div>
${showLineStaff ? `<div style="font-size:9px;font-weight:700;margin-top:2px;color:#374151">${escapeHtml(T.staff)}: ${escapeHtml(lineStaff!)}</div>` : ''}
<div style="font-size:9px;font-weight:700;color:#374151;margin-top:2px">${escapeHtml(sub)}</div>
</td>
<td style="padding:7px 2px;border-bottom:1px solid #d1d5db;vertical-align:top;text-align:end;font-weight:900;white-space:nowrap">${escapeHtml(fmtMoney(item.total))}</td>
</tr>`;
      })
      .join('');

    const beautyPayRows = payments
      .map((payment) => {
        const left = paymentLabel(payment.method, T);
        const payCode = (payment.currency || baseCurrency).trim().toUpperCase();
        const right = fmtPayment(payment.amount ?? 0, payCode);
        return `<tr><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;text-align:${ta}">${left}${payCode !== baseCurrency ? ` (${escapeHtml(payCode)})` : ''}</td><td style="padding:5px 2px;border-bottom:1px solid #d1d5db;text-align:end;font-variant-numeric:tabular-nums">${escapeHtml(right)}</td></tr>`;
      })
      .join('');

    const beautyPaymentsTable =
      payments.length > 0
        ? `<table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px;font-weight:700;margin:0 0 10px">
<thead><tr><th colspan="2" style="padding:6px 2px;border-top:2px solid #000;border-bottom:2px solid #000;text-align:${ta};font-weight:900">${escapeHtml(T.paymentDetails)}</th></tr></thead>
<tbody>
${beautyPayRows}
<tr><td style="padding:6px 2px;border-top:2px solid #000;font-weight:800;text-align:${ta}">${escapeHtml(T.paid)}</td><td style="padding:6px 2px;border-top:2px solid #000;font-weight:900;text-align:end">${escapeHtml(fmtMoney(paymentData.totalPaid || 0))}</td></tr>
${
  remaining > moneyEpsilon(baseCurrency)
    ? `<tr><td style="padding:5px 2px;font-weight:800;text-align:${ta}">${escapeHtml(T.remaining)}</td><td style="padding:5px 2px;font-weight:800;text-align:end">${escapeHtml(fmtMoney(remaining))}</td></tr>`
    : ''
}
${
  paymentData.change > moneyEpsilon(baseCurrency)
    ? `<tr><td style="padding:5px 2px;font-weight:800;color:#15803d;text-align:${ta}">${escapeHtml(T.change)}</td><td style="padding:5px 2px;font-weight:800;color:#15803d;text-align:end">${escapeHtml(fmtMoney(paymentData.change))}</td></tr>`
    : ''
}
</tbody></table>`
        : '';

    const bannerSolid = interimBanner?.trim()
      ? `<div style="text-align:center;font-size:11px;font-weight:800;margin:0 0 10px;padding:8px;border:2px solid #000">${escapeHtml(interimBanner.trim())}</div>`
      : '';

    bodyInner = `
<div style="width:100%;max-width:100%;box-sizing:border-box;margin:0;padding:2mm 3mm 3mm;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:800;color:#000;direction:${dir};text-align:${ta};-webkit-print-color-adjust:exact;print-color-adjust:exact">
  <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px">
    ${logoHtml}
    <div style="font-size:18px;font-weight:900;margin-bottom:4px">${escapeHtml(companyName)}</div>
    ${beautyPhoneOnly}
  </div>
  ${bannerSolid}
  <table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px;margin:0 0 10px">
    <colgroup><col style="width:38%" /><col style="width:62%" /></colgroup>
    <tbody>${metaRowsHtml.join('')}</tbody>
  </table>
  ${beautyNotesHtml}
  <table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px;font-weight:800;margin:0 0 10px">
    <colgroup><col style="width:62%" /><col style="width:38%" /></colgroup>
    <thead><tr>
      <th style="padding:6px 2px;border-top:2px solid #000;border-bottom:2px solid #000;text-align:${ta};font-weight:900">${escapeHtml(T.operation)}</th>
      <th style="padding:6px 2px;border-top:2px solid #000;border-bottom:2px solid #000;text-align:end;font-weight:900">${escapeHtml(T.amountLabel)}</th>
    </tr></thead>
    <tbody>${beautyItemRows}</tbody>
  </table>
  <table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:13px;margin:0 0 10px">
    <tbody>
      ${
        sale.discount > 0
          ? `<tr><td style="padding:4px 2px;color:#b91c1c;font-weight:700;text-align:${ta}">${escapeHtml(T.discount)}</td><td style="padding:4px 2px;color:#b91c1c;font-weight:700;text-align:end">-${escapeHtml(fmtMoney(sale.discount))}</td></tr>`
          : ''
      }
      <tr><td style="padding:8px 2px;border-top:2px solid #000;font-size:16px;font-weight:900;text-align:${ta}">${escapeHtml(T.total)}</td><td style="padding:8px 2px;border-top:2px solid #000;font-size:16px;font-weight:900;text-align:end">${escapeHtml(fmtMoney(sale.total ?? 0))}</td></tr>
    </tbody>
  </table>
  ${beautyPaymentsTable}
  <div style="text-align:center;font-size:13px;font-weight:800;margin-top:8px;padding-top:8px;border-top:2px solid #000">*** ${escapeHtml(T.thanks)} ***</div>
</div>`;
  } else {
    const metaRows: string[] = [];
    metaRows.push(
      `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin:2px 0"><span style="font-weight:700">${escapeHtml(T.receiptNo)}:</span><span style="font-weight:800">${escapeHtml(sale.receiptNumber)}</span></div>`
    );
    metaRows.push(
      `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin:2px 0"><span>${escapeHtml(T.date)}:</span><span>${escapeHtml(dateStr)}</span></div>`
    );
    if (sale.cashier) {
      metaRows.push(
        `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin:2px 0"><span>${escapeHtml(T.cashier)}:</span><span>${escapeHtml(sale.cashier)}</span></div>`
      );
    }
    if (sale.customerName && !retailSkip) {
      metaRows.push(
        `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin:2px 0"><span>${escapeHtml(T.customer)}:</span><span>${escapeHtml(sale.customerName)}</span></div>`
      );
    }
    if (sale.table) {
      metaRows.push(
        `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin:2px 0"><span>${escapeHtml(T.table)}:</span><span style="font-weight:800">${escapeHtml(String(sale.table))}</span></div>`
      );
    }
    if (deviceRow) {
      metaRows.push(
        `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin:2px 0;gap:6px"><span style="font-weight:800;flex-shrink:0">${escapeHtml(T.device)}:</span><span style="font-weight:700;text-align:end;word-break:break-word">${escapeHtml(deviceRow)}</span></div>`
      );
    }

    const hasBeautyLine = (sale.items || []).some((item) => !!(item.beautyStaffName ?? '').trim());
    const showTreatmentRow = !!deviceRow || hasBeautyLine || !!degVal || !!shotsVal;
    const treatmentRowHtml = showTreatmentRow
      ? `<table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px;font-weight:700;margin:4px 0 6px"><tr>
<td style="width:52%;vertical-align:bottom;text-align:${ta};padding:2px 4px 2px 0">${escapeHtml(T.treatmentDegree)}:&nbsp;<span style="display:inline-block;min-width:4.5em;border-bottom:1px dotted #000">${degVal ? escapeHtml(degVal) : '&#160;'}</span></td>
<td style="width:48%;vertical-align:bottom;text-align:end;padding:2px 0">${escapeHtml(T.treatmentShots)}:&nbsp;<span style="display:inline-block;min-width:4em;border-bottom:1px dotted #000">${shotsVal ? escapeHtml(shotsVal) : '&#160;'}</span></td>
</tr></table>`
      : '';

    const itemRows = (sale.items || [])
      .map((item) => {
        const sub = itemSubline(item, moneyDecimals);
        const variantExtra =
          item.variant && ((item.variant as any).color || (item.variant as any).size)
            ? `<div style="font-size:9px;font-weight:700;color:#374151">${escapeHtml(String((item.variant as any).color || ''))} ${escapeHtml(String((item.variant as any).size || ''))}</div>`
            : '';
        const staff = item.beautyStaffName?.trim();
        const beautyCtx = !!(staff || deviceRow);
        const nameBlock = beautyCtx
          ? `<div><span style="font-size:8px;font-weight:800;color:#4b5563">${escapeHtml(T.operation)}: </span><span style="font-weight:800;font-size:10px">${escapeHtml(item.productName || '')}</span>${staff ? `<div style="font-size:9px;font-weight:800;margin-top:3px;color:#111">${escapeHtml(T.staff)}: ${escapeHtml(staff)}</div>` : ''}</div>`
          : `<span style="font-weight:900;font-size:13px;display:block">${escapeHtml(item.productName || '')}</span>`;
        return `<tr>
<td style="padding:5px 2px;vertical-align:top;text-align:${ta};word-break:break-word;border-bottom:1px solid #e5e7eb">
${nameBlock}
${variantExtra}
<span style="font-size:9px;font-weight:700;color:#374151;display:block">${escapeHtml(sub)}</span>
</td>
<td style="padding:5px 2px;text-align:center;vertical-align:top;font-weight:800;border-bottom:1px solid #e5e7eb">${escapeHtml(String(item.quantity))}</td>
<td style="padding:5px 2px;text-align:end;vertical-align:top;font-weight:800;white-space:nowrap;border-bottom:1px solid #e5e7eb">${escapeHtml(fmtMoney(item.total))}</td>
</tr>`;
      })
      .join('');

    const itemsTableHtml = `<table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:13px;font-weight:800;margin:0 0 8px">
<colgroup><col style="width:52%" /><col style="width:14%" /><col style="width:34%" /></colgroup>
<thead><tr style="font-weight:800;border-bottom:2px solid #000">
<td style="padding:5px 2px;text-align:${ta}">${escapeHtml(T.productLabel)}</td>
<td style="padding:5px 2px;text-align:center">${escapeHtml(T.qtyLabel)}</td>
<td style="padding:5px 2px;text-align:end">${escapeHtml(T.amountLabel)}</td>
</tr></thead>
<tbody>${itemRows}</tbody>
</table>`;

    const campaignBlock =
      (sale.campaignDiscount && sale.campaignDiscount > 0) || sale.campaignId || sale.campaignName
        ? `<div style="margin:6px 0">
  <div style="display:flex;justify-content:space-between;font-size:10px;color:#c2410c;font-weight:700">
    <span>${escapeHtml(T.campaign)}:</span>
    <span>${sale.campaignDiscount && sale.campaignDiscount > 0 ? `-${escapeHtml(fmtMoney(sale.campaignDiscount))}` : escapeHtml(fmtMoney(0))}</span>
  </div>
  ${sale.campaignName ? `<div style="font-size:9px;font-weight:700;color:#1f2937;margin-top:2px;padding-${isRTL ? 'right' : 'left'}:6px">(${escapeHtml(sale.campaignName)})</div>` : ''}
</div>`
        : '';

    const barcodeSvg = `<svg width="160" height="32" style="display:block;margin:0 auto">${Array.from({ length: 20 })
      .map((_, i) => `<rect x="${i * 10}" y="0" width="6" height="40" fill="black"/>`)
      .join('')}</svg>`;

    bodyInner = `
<div style="width:100%;max-width:100%;box-sizing:border-box;margin:0;padding:2mm 3mm 3mm;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:800;color:#000;direction:${dir};text-align:${ta};-webkit-print-color-adjust:exact;print-color-adjust:exact">
  <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px">
    ${logoHtml}
    <div style="font-size:18px;font-weight:900;margin-bottom:4px">${escapeHtml(companyName)}</div>
    ${addrBlock}
    ${titleLine}
  </div>
  ${bannerHtml}
  ${metaRows.join('')}
  ${treatmentRowHtml}
  ${notesBlockHtml}
  <div style="border-top:2px dashed #000;margin:10px 0"></div>
  ${itemsTableHtml}
  <div style="border-top:2px dashed #000;margin:10px 0"></div>
  <div style="font-size:13px;margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;font-weight:800;margin:3px 0"><span>${escapeHtml(T.subtotal)}:</span><span>${escapeHtml(fmtMoney(sale.subtotal ?? 0))}</span></div>
    ${discBlock}
    ${campaignBlock}
    <div style="border-top:1px solid #000;margin:8px 0"></div>
    <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;margin-top:4px"><span>${escapeHtml(T.total)}:</span><span>${escapeHtml(fmtMoney(sale.total ?? 0))}</span></div>
  </div>
  <div style="border-top:2px dashed #000;margin:10px 0"></div>
  <div style="font-size:13px;margin-bottom:8px">
    <div style="font-weight:800;margin-bottom:8px">${escapeHtml(T.paymentDetails)}:</div>
    ${payLines}
    <div style="border-top:1px solid #000;margin:8px 0"></div>
    <div style="display:flex;justify-content:space-between;font-weight:700"><span>${escapeHtml(T.paid)}:</span><span>${escapeHtml(fmtMoney(paymentData.totalPaid || 0))}</span></div>
    ${remainingBlock}
    ${changeBlock}
  </div>
  <div style="border-top:2px dashed #000;margin:10px 0"></div>
  <div style="text-align:center;margin:8px 0">
    <div style="display:inline-block;padding:4px 8px;border:1px solid #ccc;background:#fff">
      ${barcodeSvg}
      <div style="font-size:10px;margin-top:4px;font-family:system-ui,sans-serif;font-weight:800">${escapeHtml(sale.receiptNumber)}</div>
    </div>
  </div>
  <div style="text-align:center;font-size:13px;font-weight:800;margin-top:8px">*** ${escapeHtml(T.thanks)} ***</div>
  <div style="border-top:2px dashed #000;margin-top:10px"></div>
</div>`;
  }

  return `<!DOCTYPE html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8">${RECEIPT_80MM_VIEWPORT_FOR_HEADLESS}<title>${escapeHtml(companyName)} - ${escapeHtml(sale.receiptNumber)}</title>
<style>
${RECEIPT_80MM_DOCUMENT_CSS}
  body { padding: 0; font-family: 'Courier New', Courier, monospace; direction: ${dir}; -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow-x: hidden; }
  * { box-sizing: border-box; }
</style></head><body>${bodyInner}</body></html>`;
}

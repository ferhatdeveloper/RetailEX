/**
 * Receipt80mm ile aynı 80mm fiş düzeni — doğrudan yazıcıya giden HTML (Tauri / iframe print).
 * Önizleme modalındaki görünümle hizalı satır düzeni, kesik çizgiler, ödeme blokları, barkod.
 */
import type { Sale, SaleItem } from '../core/types/models';
import type { ReceiptSettings } from '../services/receiptSettingsService';
import { formatNumber } from './formatNumber';
/** Receipt80mm / POS fiş dili */
export type Receipt80mmPrintLocale = 'tr' | 'en' | 'ar' | 'ku';

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
    locale === 'ar' ? 'ar-SA' : locale === 'ku' ? 'ku-IQ' : locale === 'en' ? 'en-GB' : 'tr-TR';
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

function itemSubline(item: SaleItem): string {
  const mult = (item as any).multiplier && (item as any).multiplier > 1 ? (item as any).multiplier : 1;
  const unit = (item as any).unit || '';
  const basePrice = mult > 1 ? item.price / mult : item.price;
  if (mult > 1 && unit) {
    return `${item.quantity} ${unit} × ${formatNumber(basePrice, 0, true)}`;
  }
  return `${item.quantity} × ${formatNumber(item.price, 0, true)}`;
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
    locale: localeIn = 'tr',
    interimBanner,
  } = input;

  const locale: Receipt80mmPrintLocale =
    localeIn === 'tr' || localeIn === 'en' || localeIn === 'ar' || localeIn === 'ku' ? localeIn : 'tr';
  const T = TEXT[locale];
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
  const beautyDeviceRow = sale.beautyDeviceName?.trim();
  if (beautyDeviceRow) {
    metaRows.push(
      `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin:2px 0;gap:6px"><span style="font-weight:800;flex-shrink:0">${escapeHtml(T.device)}:</span><span style="font-weight:700;text-align:end;word-break:break-word">${escapeHtml(beautyDeviceRow)}</span></div>`
    );
  }

  const itemsHtml = (sale.items || [])
    .map((item) => {
      const sub = itemSubline(item);
      const variantExtra =
        item.variant && ((item.variant as any).color || (item.variant as any).size)
          ? `<div style="font-size:9px;font-weight:700;color:#374151">${escapeHtml(String((item.variant as any).color || ''))} ${escapeHtml(String((item.variant as any).size || ''))}</div>`
          : '';
      const staff = item.beautyStaffName?.trim();
      const beautyCtx = !!(staff || beautyDeviceRow);
      const nameBlock = beautyCtx
        ? `<div><span style="font-size:8px;font-weight:800;color:#4b5563">${escapeHtml(T.operation)}: </span><span style="font-weight:800;font-size:10px">${escapeHtml(item.productName || '')}</span>${staff ? `<div style="font-size:9px;font-weight:800;margin-top:3px;color:#111">${escapeHtml(T.staff)}: ${escapeHtml(staff)}</div>` : ''}</div>`
        : `<span style="font-weight:800;font-size:10px;display:block">${escapeHtml(item.productName || '')}</span>`;
      return `<div style="display:flex;gap:4px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;align-items:flex-start">
  <div style="flex:1;min-width:0;text-align:${ta};word-break:break-word">
    ${nameBlock}
    ${variantExtra}
    <span style="font-size:9px;font-weight:700;color:#374151;display:block">${escapeHtml(sub)}</span>
  </div>
  <div style="width:36px;flex-shrink:0;text-align:center;font-size:10px;font-weight:800;padding-top:2px">${escapeHtml(String(item.quantity))}</div>
  <div style="width:76px;flex-shrink:0;text-align:end;font-size:10px;font-weight:800;white-space:nowrap;padding-top:2px">${formatNumber(item.total, 0, true)} IQD</div>
</div>`;
    })
    .join('');

  const campaignBlock =
    (sale.campaignDiscount && sale.campaignDiscount > 0) || sale.campaignId || sale.campaignName
      ? `<div style="margin:6px 0">
  <div style="display:flex;justify-content:space-between;font-size:10px;color:#c2410c;font-weight:700">
    <span>${escapeHtml(T.campaign)}:</span>
    <span>${sale.campaignDiscount && sale.campaignDiscount > 0 ? `-${formatNumber(sale.campaignDiscount, 0, true)} IQD` : '0 IQD'}</span>
  </div>
  ${sale.campaignName ? `<div style="font-size:9px;font-weight:700;color:#1f2937;margin-top:2px;padding-${isRTL ? 'right' : 'left'}:6px">(${escapeHtml(sale.campaignName)})</div>` : ''}
</div>`
      : '';

  const discBlock =
    sale.discount > 0
      ? `<div style="display:flex;justify-content:space-between;font-size:10px;color:#b91c1c;font-weight:700;margin:2px 0"><span>${escapeHtml(T.discount)}:</span><span>-${formatNumber(sale.discount, 0, true)} IQD</span></div>`
      : '';

  const payments = paymentData.payments || [];
  const payLines = payments
    .map((payment) => {
      const left = paymentLabel(payment.method, T);
      const right =
        payment.currency === 'IQD' || !payment.currency
          ? `${formatNumber(payment.amount ?? 0, 0, true)} IQD`
          : `${payment.amount} ${payment.currency}`;
      return `<div style="display:flex;justify-content:space-between;font-size:10px;margin:4px 0;padding-${isRTL ? 'right' : 'left'}:8px"><span>${left}${payment.currency && payment.currency !== 'IQD' ? ` (${escapeHtml(payment.currency)})` : ''}</span><span>${right}</span></div>`;
    })
    .join('');

  const remaining = paymentData.remaining ?? 0;
  const remainingBlock =
    remaining > 0.01
      ? `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:800;margin-top:6px"><span>${escapeHtml(T.remaining)}:</span><span>${formatNumber(remaining, 0, true)} IQD</span></div>`
      : '';

  const barcodeSvg = `<svg width="160" height="32" style="display:block;margin:0 auto">${Array.from({ length: 20 })
    .map((_, i) => `<rect x="${i * 10}" y="0" width="6" height="40" fill="black"/>`)
    .join('')}</svg>`;

  const bodyInner = `
<div style="width:80mm;max-width:80mm;box-sizing:border-box;margin:0 auto;padding:2mm 3mm 3mm;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:600;color:#000;direction:${dir};text-align:${ta};-webkit-print-color-adjust:exact;print-color-adjust:exact">
  <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px">
    ${logoHtml}
    <div style="font-size:15px;font-weight:800;margin-bottom:4px">${escapeHtml(companyName)}</div>
    ${addrBlock}
    ${titleLine}
  </div>
  ${bannerHtml}
  ${metaRows.join('')}
  <div style="border-top:2px dashed #000;margin:10px 0"></div>
  <div style="display:flex;gap:4px;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid #000;font-size:9px;font-weight:800">
    <span style="flex:1;min-width:0">${escapeHtml(T.productLabel)}</span>
    <span style="width:36px;text-align:center;flex-shrink:0">${escapeHtml(T.qtyLabel)}</span>
    <span style="width:76px;text-align:end;flex-shrink:0">${escapeHtml(T.amountLabel)}</span>
  </div>
  ${itemsHtml}
  <div style="border-top:2px dashed #000;margin:10px 0"></div>
  <div style="font-size:10px;margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;font-weight:700;margin:3px 0"><span>${escapeHtml(T.subtotal)}:</span><span>${formatNumber(sale.subtotal ?? 0, 0, true)} IQD</span></div>
    ${discBlock}
    ${campaignBlock}
    <div style="border-top:1px solid #000;margin:8px 0"></div>
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;margin-top:4px"><span>${escapeHtml(T.total)}:</span><span>${formatNumber(sale.total ?? 0, 0, true)} IQD</span></div>
  </div>
  <div style="border-top:2px dashed #000;margin:10px 0"></div>
  <div style="font-size:10px;margin-bottom:8px">
    <div style="font-weight:800;margin-bottom:8px">${escapeHtml(T.paymentDetails)}:</div>
    ${payLines}
    <div style="border-top:1px solid #000;margin:8px 0"></div>
    <div style="display:flex;justify-content:space-between;font-weight:700"><span>${escapeHtml(T.paid)}:</span><span>${formatNumber(paymentData.totalPaid || 0, 0, true)} IQD</span></div>
    ${remainingBlock}
    ${
      paymentData.change > 0
        ? `<div style="display:flex;justify-content:space-between;font-weight:800;color:#15803d;margin-top:8px;font-size:11px"><span>${escapeHtml(T.change)}:</span><span>${formatNumber(paymentData.change, 0, true)} IQD</span></div>`
        : ''
    }
  </div>
  <div style="border-top:2px dashed #000;margin:10px 0"></div>
  <div style="text-align:center;margin:8px 0">
    <div style="display:inline-block;padding:4px 8px;border:1px solid #ccc;background:#fff">
      ${barcodeSvg}
      <div style="font-size:10px;margin-top:4px;font-family:system-ui,sans-serif;font-weight:800">${escapeHtml(sale.receiptNumber)}</div>
    </div>
  </div>
  <div style="text-align:center;font-size:10px;font-weight:700;margin-top:8px">*** ${escapeHtml(T.thanks)} ***</div>
  <div style="border-top:2px dashed #000;margin-top:10px"></div>
</div>`;

  return `<!DOCTYPE html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(companyName)} - ${escapeHtml(sale.receiptNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  @media print { @page { size: 80mm auto; margin: 0; } html, body { width: 80mm !important; max-width: 80mm !important; margin: 0 !important; padding: 0 !important; } }
  html, body { margin: 0; padding: 0; width: 80mm; max-width: 80mm; box-sizing: border-box; }
  body { padding: 0; font-family: 'Courier New', Courier, monospace; direction: ${dir}; -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow-x: hidden; }
  * { box-sizing: border-box; }
</style></head><body>${bodyInner}</body></html>`;
}

import type { Sale } from '../core/types/models';
import type { ReceiptSettings } from '../services/receiptSettingsService';
import { buildReceipt80mmPrintHtml } from './receipt80mmPrintHtml';

/** Receipt80mm / mutfak fişi ile aynı dil kodları */
export type KitchenReceiptLocale = 'tr' | 'en' | 'ar' | 'ku';

/** 80mm ön hesap — `Receipt80mm` / `translations.receipt` ile uyumlu etiketler */
const ADISYON_I18N: Record<
  KitchenReceiptLocale,
  {
    docTitle: string;
    draftBanner: string;
    receiptNo: string;
    date: string;
    cashier: string;
    table: string;
    colProduct: string;
    colQty: string;
    colAmount: string;
    subtotal: string;
    discount: string;
    total: string;
    paymentHeading: string;
    paid: string;
    remaining: string;
    change: string;
    thanksLine: string;
    payCash: string;
    payCard: string;
    payCredit: string;
    payQr: string;
    taxId: string;
    taxOffice: string;
  }
> = {
  tr: {
    docTitle: 'Fiş',
    draftBanner: 'ÖN HESAP',
    receiptNo: 'FİŞ NO',
    date: 'TARİH',
    cashier: 'KASİYER',
    table: 'MASA',
    colProduct: 'Ürün',
    colQty: 'Adet',
    colAmount: 'Tutar',
    subtotal: 'ARA TOPLAM',
    discount: 'İNDİRİM',
    total: 'TOPLAM',
    paymentHeading: 'ÖDEME',
    paid: 'ÖDENEN',
    remaining: 'KALAN',
    change: 'PARA ÜSTÜ',
    thanksLine: 'Bizi Tercih Ettiğiniz İçin Teşekkürler',
    payCash: 'NAKIT',
    payCard: 'KART',
    payCredit: 'VERESIYE',
    payQr: 'QR',
    taxId: 'VKN',
    taxOffice: 'VD',
  },
  en: {
    docTitle: 'Receipt',
    draftBanner: 'INTERIM BILL',
    receiptNo: 'RECEIPT NO',
    date: 'DATE',
    cashier: 'SERVER',
    table: 'TABLE',
    colProduct: 'Item',
    colQty: 'Qty',
    colAmount: 'Amount',
    subtotal: 'SUBTOTAL',
    discount: 'DISCOUNT',
    total: 'TOTAL',
    paymentHeading: 'PAYMENT',
    paid: 'PAID',
    remaining: 'REMAINING',
    change: 'CHANGE',
    thanksLine: 'Thank You For Choosing Us',
    payCash: 'CASH',
    payCard: 'CARD',
    payCredit: 'CREDIT',
    payQr: 'QR',
    taxId: 'TIN',
    taxOffice: 'TAX OFF.',
  },
  ar: {
    docTitle: 'إيصال',
    draftBanner: 'فاتورة مؤقتة',
    receiptNo: 'رقم الإيصال',
    date: 'التاريخ',
    cashier: 'الكاشير',
    table: 'طاولة',
    colProduct: 'الصنف',
    colQty: 'العدد',
    colAmount: 'المبلغ',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    total: 'الإجمالي',
    paymentHeading: 'الدفع',
    paid: 'المدفوع',
    remaining: 'المتبقي',
    change: 'الباقي',
    thanksLine: 'شكراً لاختياركم لنا',
    payCash: 'نقد',
    payCard: 'بطاقة',
    payCredit: 'آجل',
    payQr: 'QR',
    taxId: 'الرقم الضريبي',
    taxOffice: 'مكتب الضريبة',
  },
  ku: {
    docTitle: 'پسوولە',
    draftBanner: 'وەسڵی پێشووەختە',
    receiptNo: 'ژ. پسوولە',
    date: 'بەروار',
    cashier: 'کاشێر',
    table: 'مێز',
    colProduct: 'بەرهەم',
    colQty: 'ژمارە',
    colAmount: 'بڕ',
    subtotal: 'کۆی ناوەند',
    discount: 'داشکاندن',
    total: 'کۆی گشتی',
    paymentHeading: 'پارەدان',
    paid: 'پارەدراو',
    remaining: 'ماوە',
    change: 'گەڕاوە',
    thanksLine: 'سپاس بۆ هەڵبژاردنمان',
    payCash: 'نەقد',
    payCard: 'کارت',
    payCredit: 'قەرز',
    payQr: 'QR',
    taxId: 'ژمارەی باج',
    taxOffice: 'نووسینگەی باج',
  },
};

/** Restoran ödeme modalı taslak yazdırma bağlamı (POS modal ile uyumlu) */
export type RestaurantDraftPaymentCtx = {
  payments: Array<{ method: string; amount: number; currency: string }>;
  totalPaid: number;
  change: number;
  remaining: number;
  finalTotal: number;
  discount: number;
};

export type RestaurantAdisyonPrintInput = {
  sale: Sale;
  ctx: RestaurantDraftPaymentCtx;
  companyName: string;
  logoDataUrl?: string | null;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxOffice?: string;
  companyTaxNumber?: string;
  /** Başlık altı firma unvanı — Receipt80mm ile aynı */
  firmTitle?: string;
  /** Fiş üstü etiket — verilmezse `locale` için çeviri kullanılır */
  draftLabel?: string;
  /** Fiş metinleri — Receipt80mm ile aynı kodlar */
  locale?: KitchenReceiptLocale;
};

/**
 * 80mm ön fiş / adisyon — `Receipt80mm` önizlemesiyle aynı düzen; doğrudan yazıcıya.
 */
export function buildRestaurantAdisyonHtml(input: RestaurantAdisyonPrintInput): string {
  const {
    sale,
    ctx,
    companyName,
    logoDataUrl,
    companyAddress,
    companyPhone,
    companyTaxOffice,
    companyTaxNumber,
    firmTitle,
    draftLabel: draftLabelIn,
    locale: localeIn = 'tr',
  } = input;

  const locale: KitchenReceiptLocale = localeIn in ADISYON_I18N ? localeIn : 'tr';
  const L = ADISYON_I18N[locale];
  const interimBanner = draftLabelIn?.trim() || L.draftBanner;

  const receiptSettings: ReceiptSettings = {
    companyName,
    logoDataUrl: logoDataUrl ?? undefined,
    companyAddress,
    companyPhone,
    companyTaxOffice,
    companyTaxNumber,
  };

  return buildReceipt80mmPrintHtml({
    sale,
    paymentData: {
      payments: ctx.payments,
      totalPaid: ctx.totalPaid,
      change: ctx.change,
      remaining: ctx.remaining,
    },
    receiptSettings,
    companyNameFallback: companyName,
    firmTitle,
    locale,
    interimBanner,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type KitchenTicketItemLine = {
  name: string;
  quantity: number;
  course?: string;
  notes?: string;
  options?: string;
};

const KITCHEN_I18N: Record<
  KitchenReceiptLocale,
  {
    title: string;
    tableSource: string;
    floor: string;
    waiter: string;
    time: string;
    empty: string;
    footer: string;
    /** Tablo başlığı — adet sütunu */
    colQty: string;
    /** Tablo başlığı — ürün adı */
    colProduct: string;
  }
> = {
  tr: {
    title: 'MUTFAK FİŞİ',
    tableSource: 'MASA / KAYNAK:',
    floor: 'BÖLGE:',
    waiter: 'GARSON:',
    time: 'SAAT:',
    empty: '(kalem yok)',
    footer: '— hazırlanacak —',
    colQty: 'Adet',
    colProduct: 'Ürün',
  },
  en: {
    title: 'KITCHEN TICKET',
    tableSource: 'TABLE / SOURCE:',
    floor: 'AREA:',
    waiter: 'SERVER:',
    time: 'TIME:',
    empty: '(no items)',
    footer: '— to prepare —',
    colQty: 'Qty',
    colProduct: 'Item',
  },
  ar: {
    title: 'فاتورة المطبخ',
    tableSource: 'طاولة / مصدر:',
    floor: 'منطقة:',
    waiter: 'نادل:',
    time: 'الوقت:',
    empty: '(لا عناصر)',
    footer: '— للتحضير —',
    colQty: 'العدد',
    colProduct: 'الصنف',
  },
  ku: {
    title: 'پسوولەی چێشتخانە',
    tableSource: 'مێز / سەرچاوە:',
    floor: 'ناوچە:',
    waiter: 'گەرسۆن:',
    time: 'کات:',
    empty: '(بێ بەرهەم)',
    footer: '— بۆ ئامادەکردن —',
    colQty: 'ژمارە',
    colProduct: 'بەرهەم',
  },
};

function kitchenDateLocale(locale: KitchenReceiptLocale): string {
  switch (locale) {
    case 'en':
      return 'en-GB';
    case 'ar':
      return 'ar-IQ';
    case 'ku':
      return 'ku-IQ';
    default:
      return 'tr-TR';
  }
}

/**
 * 80mm mutfak fişi — fiyat yok; masa, zaman, kalemler ve notlar.
 */
export function buildRestaurantKitchenTicketHtml(input: {
  tableNumber: string;
  floorName?: string;
  waiter?: string;
  /** Sipariş / masa notu */
  orderNote?: string;
  items: KitchenTicketItemLine[];
  printedAtLabel?: string;
  /** Fiş başlığı ve meta etiketleri (varsayılan: tr) */
  locale?: KitchenReceiptLocale;
}): string {
  const {
    tableNumber,
    floorName,
    waiter,
    orderNote,
    items,
    printedAtLabel: printedAtOverride,
    locale: localeIn = 'tr',
  } = input;

  const locale: KitchenReceiptLocale = localeIn in KITCHEN_I18N ? localeIn : 'tr';
  const L = KITCHEN_I18N[locale];
  const printedAtLabel =
    printedAtOverride ?? new Date().toLocaleString(kitchenDateLocale(locale));

  const cellBorder = 'border:1px solid #000;padding:3px 4px;vertical-align:top';
  const rows = (items || []).map((it) => {
    const opt = it.options?.trim();
    const nt = it.notes?.trim();
    const crs = it.course?.trim();
    /** Mutfakta önce sipariş notu, sonra seçenek, sonra sıra — ürün adı satırına eklenmez; tam genişlik alt satırda */
    const detailParts = [nt, opt, crs ? `(${crs})` : ''].filter((s): s is string => Boolean(s && String(s).trim()));
    const detailText = detailParts.join(' · ');
    const qty = `${it.quantity}x`;
    const mainRow = `<tr>
<td style="${cellBorder};width:16%;min-width:14mm;text-align:center;font-size:11px;font-weight:900;white-space:nowrap">${escapeHtml(qty)}</td>
<td style="${cellBorder};font-size:11px;font-weight:900;word-break:break-word;vertical-align:top">${escapeHtml(it.name)}</td>
</tr>`;
    const descRow =
      detailParts.length > 0
        ? `<tr>
<td colspan="2" style="${cellBorder};font-size:10px;font-weight:700;font-style:italic;line-height:1.35;word-break:break-word;text-align:start" role="note" aria-label="${escapeHtml(detailText)}">${escapeHtml(detailText)}</td>
</tr>`
        : '';
    return mainRow + descRow;
  }).join('');

  const thead = `<thead><tr>
<th style="${cellBorder};width:16%;text-align:center;font-size:8px;font-weight:800">${escapeHtml(L.colQty)}</th>
<th style="${cellBorder};text-align:left;font-size:8px;font-weight:800">${escapeHtml(L.colProduct)}</th>
</tr></thead>`;

  const metaTdLabel = `${cellBorder};width:38%;font-size:10px;font-weight:800;word-break:break-word`;
  const metaTdValue = `${cellBorder};text-align:right;font-size:10px;font-weight:800;word-break:break-word`;
  const metaRows = [
    `<tr><td style="${metaTdLabel}">${escapeHtml(L.tableSource)}</td><td style="${metaTdValue};font-weight:900">${escapeHtml(tableNumber)}</td></tr>`,
    floorName
      ? `<tr><td style="${metaTdLabel}">${escapeHtml(L.floor)}</td><td style="${metaTdValue}">${escapeHtml(floorName)}</td></tr>`
      : '',
    waiter
      ? `<tr><td style="${metaTdLabel}">${escapeHtml(L.waiter)}</td><td style="${metaTdValue}">${escapeHtml(waiter)}</td></tr>`
      : '',
    `<tr><td style="${metaTdLabel}">${escapeHtml(L.time)}</td><td style="${metaTdValue};font-weight:700">${escapeHtml(printedAtLabel)}</td></tr>`,
  ]
    .filter(Boolean)
    .join('');

  const dir = locale === 'ar' || locale === 'ku' ? 'rtl' : 'ltr';

  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(L.title)}</title>
<style>
  @page{size:80mm auto;margin:0}
  html,body{height:auto!important;min-height:0!important;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;padding:3mm 3mm 2mm 3mm;font-size:11px;line-height:1.25;width:80mm;max-width:80mm;box-sizing:border-box;color:#000;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  *{color:#000 !important;box-sizing:border-box}
  h2{text-align:center;margin:4px 0 6px 0;font-size:15px;font-weight:900;letter-spacing:0.06em}
  hr{border:0;border-top:1.5px dashed #000;margin:6px 0}
  table.kitchen-lines{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #000;margin-bottom:4px}
  table.kitchen-lines th,table.kitchen-lines td{border:1px solid #000}
</style>
</head><body dir="${dir}">
<h2>${escapeHtml(L.title)}</h2>
<table class="kitchen-lines"><tbody>${metaRows}</tbody></table>
${orderNote?.trim() ? `<p style="margin:4px 0 6px 0;font-size:10px;font-weight:800;border:1px dashed #000;padding:4px">${escapeHtml(orderNote.trim())}</p>` : ''}
<hr/>
<table class="kitchen-lines">${thead}<tbody>${rows || `<tr><td colspan="2" style="border:1px solid #000;padding:6px;font-size:10px;text-align:center">${escapeHtml(L.empty)}</td></tr>`}</tbody></table>
<hr/>
<p style="text-align:center;font-size:9px;font-weight:600;margin:4px 0 0 0">${escapeHtml(L.footer)}</p>
</body></html>`;
}

/**
 * Tam HTML belgesini gizli iframe’e yükleyip sistem yazdırma diyaloğunu açar.
 * Ana uygulama penceresinde `body * { visibility:hidden }` tabanlı print ile boş önizleme oluşmasını önler
 * (Receipt80mm, WebView2, bazı Chrome sürümleri).
 */
export async function printHtmlInHiddenIframe(html: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  const doc = w?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error('iframe document');
  }
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
      resolve();
    };
    const onAfterPrint = () => {
      w?.removeEventListener('afterprint', onAfterPrint);
      setTimeout(cleanup, 100);
    };
    w?.addEventListener('afterprint', onAfterPrint);
    requestAnimationFrame(() => {
      try {
        w?.focus();
        w?.print();
      } catch (err) {
        w?.removeEventListener('afterprint', onAfterPrint);
        try {
          document.body.removeChild(iframe);
        } catch {
          /* ignore */
        }
        reject(err);
        return;
      }
      /* afterprint her ortamda tetiklenmez (özellikle İptal) */
      setTimeout(cleanup, 2500);
    });
  });
}

/**
 * Önizleme penceresi açmadan yazdır: Tauri → print_html_silent; aksi gizli iframe + print().
 * Gecikmeler minimum tutulur (iframe yolu tarayıcı yazdırma iletişim kutusu için).
 *
 * @param explicitPrinter — `undefined`: kasa fişi ayarındaki Windows yazıcısı; `string`: bu ad; `null`: OS varsayılanı
 */
export async function printRestaurantHtmlNoPreview(html: string, explicitPrinter?: string | null): Promise<void> {
  const isTauri = typeof window !== 'undefined' && ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ || (window as unknown as { __TAURI__?: unknown }).__TAURI__);
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      let printerName: string | null;
      if (explicitPrinter === undefined) {
        const { getAccountReceiptSystemPrinterName } = await import('./restaurantAccountReceiptPrinter');
        printerName = getAccountReceiptSystemPrinterName();
      } else {
        printerName = explicitPrinter;
      }
      await invoke('print_html_silent', { html, printerName: printerName ?? null });
      return;
    } catch (e) {
      console.warn('[restaurantReceiptPrint] print_html_silent:', e);
    }
  }

  await printHtmlInHiddenIframe(html);
}

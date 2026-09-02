/**
 * Print tasarımları için 4-dilli ortak etiket sözlüğü.
 *
 * Akış:
 *  1. Web/Mobil: enqueue*Job sırasında payload.translations alanına bu sözlük eklenir
 *     (tüm diller — renderer hangisini seçeceğini payload.locale veya printer_default_locale'e göre belirler).
 *  2. C# PrintServer (PrintServer.Core/Rendering): payload.translations[locale] sözlüğünü okur
 *     ve şablonun {{tr.table}} / {{en.table}} tokenlarını çözer.
 *  3. Node worker (kitchen-print-service.mjs): payload.translations[locale] okur,
 *     hard-coded Türkçe fallback kullanmaz.
 *
 * Bu dosya hem web hem C# PrintServer tarafı için tek doğruluk kaynağıdır.
 * C# karşılığı PrintServer.Core/i18n/PrintStrings.cs + PrintStrings.*.resx dosyalarıdır
 * (küçük farklılıklar build zamanında not alınır).
 */

export type SupportedPrintLocale = 'tr' | 'en' | 'ar' | 'ku';

export type PrintStringKey =
  | 'kitchenHeader'
  | 'kitchenFooter'
  | 'accountHeader'
  | 'accountFooter'
  | 'posHeader'
  | 'posFooter'
  | 'invoiceHeader'
  | 'invoiceFooter'
  | 'cashVoucherHeader'
  | 'cashVoucherFooter'
  | 'table'
  | 'floor'
  | 'waiter'
  | 'orderNo'
  | 'orderNote'
  | 'date'
  | 'time'
  | 'itemCount'
  | 'itemName'
  | 'unitPrice'
  | 'lineTotal'
  | 'subtotal'
  | 'total'
  | 'discount'
  | 'tax'
  | 'grandTotal'
  | 'paid'
  | 'change'
  | 'currency'
  | 'thankYou'
  | 'openDrawer'
  | 'customer'
  | 'supplier'
  | 'balance'
  | 'openingBalance'
  | 'debit'
  | 'credit'
  | 'invoiceNo'
  | 'dateRange'
  | 'documentType'
  | 'quantity'
  | 'printerTest'
  | 'emptyOrder'
  | 'course'
  | 'orderType'
  | 'takeaway'
  | 'dineIn'
  | 'delivery'
  | 'cut'
  | 'copy';

type PrintDict = Record<PrintStringKey, string>;

const TR: PrintDict = {
  kitchenHeader: 'MUTFAK',
  kitchenFooter: '— hazırlanacak —',
  accountHeader: 'CARİ HESAP',
  accountFooter: '— hesap özeti —',
  posHeader: 'POS FİŞİ',
  posFooter: '— teşekkürler —',
  invoiceHeader: 'FATURA',
  invoiceFooter: '— satış faturası —',
  cashVoucherHeader: 'TAHSİLAT FİŞİ',
  cashVoucherFooter: '— tahsilat makbuzu —',
  table: 'Masa',
  floor: 'Salon',
  waiter: 'Garson',
  orderNo: 'Sipariş No',
  orderNote: 'Not',
  date: 'Tarih',
  time: 'Saat',
  itemCount: 'Adet',
  itemName: 'Ürün',
  unitPrice: 'Birim Fiyat',
  lineTotal: 'Tutar',
  subtotal: 'Ara Toplam',
  total: 'Toplam',
  discount: 'İskonto',
  tax: 'KDV',
  grandTotal: 'Genel Toplam',
  paid: 'Ödenen',
  change: 'Para Üstü',
  currency: 'TL',
  thankYou: 'Teşekkür ederiz',
  openDrawer: 'Para Çekmecesi Aç',
  customer: 'Müşteri',
  supplier: 'Tedarikçi',
  balance: 'Bakiye',
  openingBalance: 'Devir',
  debit: 'Borç',
  credit: 'Alacak',
  invoiceNo: 'Fatura No',
  dateRange: 'Tarih Aralığı',
  documentType: 'Belge Tipi',
  quantity: 'Miktar',
  printerTest: 'Yazıcı Test Sayfası',
  emptyOrder: '(Boş sipariş)',
  course: 'Sıra',
  orderType: 'Sipariş Tipi',
  takeaway: 'Paket',
  dineIn: 'Masa',
  delivery: 'Gel-Al',
  cut: 'FİŞ KESİLDİ',
  copy: 'Kopya',
};

const EN: PrintDict = {
  kitchenHeader: 'KITCHEN',
  kitchenFooter: '— to prepare —',
  accountHeader: 'ACCOUNT STATEMENT',
  accountFooter: '— account summary —',
  posHeader: 'POS RECEIPT',
  posFooter: '— thank you —',
  invoiceHeader: 'INVOICE',
  invoiceFooter: '— sales invoice —',
  cashVoucherHeader: 'PAYMENT VOUCHER',
  cashVoucherFooter: '— payment receipt —',
  table: 'Table',
  floor: 'Floor',
  waiter: 'Waiter',
  orderNo: 'Order #',
  orderNote: 'Note',
  date: 'Date',
  time: 'Time',
  itemCount: 'Qty',
  itemName: 'Item',
  unitPrice: 'Unit Price',
  lineTotal: 'Amount',
  subtotal: 'Subtotal',
  total: 'Total',
  discount: 'Discount',
  tax: 'Tax',
  grandTotal: 'Grand Total',
  paid: 'Paid',
  change: 'Change',
  currency: 'USD',
  thankYou: 'Thank you',
  openDrawer: 'Open Drawer',
  customer: 'Customer',
  supplier: 'Supplier',
  balance: 'Balance',
  openingBalance: 'Opening',
  debit: 'Debit',
  credit: 'Credit',
  invoiceNo: 'Invoice #',
  dateRange: 'Date Range',
  documentType: 'Document Type',
  quantity: 'Quantity',
  printerTest: 'Printer Test Page',
  emptyOrder: '(Empty order)',
  course: 'Course',
  orderType: 'Order Type',
  takeaway: 'Takeaway',
  dineIn: 'Dine In',
  delivery: 'Delivery',
  cut: 'CUT — THANK YOU',
  copy: 'Copy',
};

const AR: PrintDict = {
  kitchenHeader: 'المطبخ',
  kitchenFooter: '— للتحضير —',
  accountHeader: 'كشف الحساب',
  accountFooter: '— ملخص الحساب —',
  posHeader: 'إيصال نقطة البيع',
  posFooter: '— شكراً لكم —',
  invoiceHeader: 'فاتورة',
  invoiceFooter: '— فاتورة مبيعات —',
  cashVoucherHeader: 'سند قبض',
  cashVoucherFooter: '— إيصال تحصيل —',
  table: 'الطاولة',
  floor: 'الصالة',
  waiter: 'النادل',
  orderNo: 'رقم الطلب',
  orderNote: 'ملاحظة',
  date: 'التاريخ',
  time: 'الوقت',
  itemCount: 'العدد',
  itemName: 'الصنف',
  unitPrice: 'سعر الوحدة',
  lineTotal: 'المبلغ',
  subtotal: 'المجموع الفرعي',
  total: 'الإجمالي',
  discount: 'الخصم',
  tax: 'الضريبة',
  grandTotal: 'المجموع الكلي',
  paid: 'المدفوع',
  change: 'الباقي',
  currency: 'د.ع',
  thankYou: 'شكراً لزيارتكم',
  openDrawer: 'فتح الدرج',
  customer: 'العميل',
  supplier: 'المورّد',
  balance: 'الرصيد',
  openingBalance: 'رصيد افتتاحي',
  debit: 'مدين',
  credit: 'دائن',
  invoiceNo: 'رقم الفاتورة',
  dateRange: 'الفترة الزمنية',
  documentType: 'نوع المستند',
  quantity: 'الكمية',
  printerTest: 'صفحة اختبار الطابعة',
  emptyOrder: '(طلب فارغ)',
  course: 'الطبق',
  orderType: 'نوع الطلب',
  takeaway: 'سفري',
  dineIn: 'بالجلوس',
  delivery: 'توصيل',
  cut: 'تم قص الإيصال',
  copy: 'نسخة',
};

const KU: PrintDict = {
  kitchenHeader: 'Metbex',
  kitchenFooter: '— bê amadekirin —',
  accountHeader: 'Hesabê Carî',
  accountFooter: '— kurteya hesabê —',
  posHeader: 'Pisûleya POS',
  posFooter: '— spas dikin —',
  invoiceHeader: 'Fatûre',
  invoiceFooter: '— fatûreya firotina —',
  cashVoucherHeader: 'Pisûleya Wergirtinê',
  cashVoucherFooter: '— makbuza wergirtinê —',
  table: 'Masa',
  floor: 'Salon',
  waiter: 'Xulam',
  orderNo: 'Hejmara Siparîşê',
  orderNote: 'Nîşe',
  date: 'Dîrok',
  time: 'Dem',
  itemCount: 'Hejmar',
  itemName: 'Berhem',
  unitPrice: 'Biha Yekeyê',
  lineTotal: 'Biha',
  subtotal: 'Koma Navîn',
  total: 'Bi giştî',
  discount: 'Daxistin',
  tax: 'Bac',
  grandTotal: 'Bi giştî ya Mezin',
  paid: 'Hat dayîn',
  change: 'Veger',
  currency: 'IQD',
  thankYou: 'Sipas ji bo serdanê',
  openDrawer: 'Kelseyê Ve Bike',
  customer: 'Kiryar',
  supplier: 'Pêşkêşkar',
  balance: 'Balans',
  openingBalance: 'Destpêk',
  debit: 'Qarz',
  credit: 'Mafdar',
  invoiceNo: 'Hejmara Fatûreyê',
  dateRange: 'Dema Dîrokan',
  documentType: 'Cûreyê Belgeyê',
  quantity: 'Hejmar',
  printerTest: 'Rûpela Testa Çapkerê',
  emptyOrder: '(Siparîşê vala)',
  course: 'Rêz',
  orderType: 'Cûreyê Siparîşê',
  takeaway: 'Pakêt',
  dineIn: 'Li Masê',
  delivery: 'Anîn-Birin',
  cut: 'Fîş hat birîn',
  copy: 'Kopi',
};

export const PRINT_STRINGS: Record<SupportedPrintLocale, PrintDict> = {
  tr: TR,
  en: EN,
  ar: AR,
  ku: KU,
};

/**
 * Yazıcı kuyruğuna yazılacak payload.translations alanını üretir.
 * Hem C# PrintServer (PostgREST üzerinden okur) hem Node worker (kitchen-print-service.mjs) aynı yapıyı kullanır.
 * Bu payload tasarım şablonu FastReport veya HTML renderer'da {{tr.table}}, {{en.table}} gibi token'lara dönüşür.
 */
export function assemblePrintTranslations(): Record<SupportedPrintLocale, Record<PrintStringKey, string>> {
  return {
    tr: { ...PRINT_STRINGS.tr },
    en: { ...PRINT_STRINGS.en },
    ar: { ...PRINT_STRINGS.ar },
    ku: { ...PRINT_STRINGS.ku },
  };
}

/**
 * Belirli bir dil için etiket sözlüğünü döndürür (kopyası).
 */
export function getPrintStrings(locale: SupportedPrintLocale): Record<PrintStringKey, string> {
  return { ...PRINT_STRINGS[locale] };
}

/**
 * Tek etiket çözümü. Geçersiz/boş locale → 'tr' fallback. Bilinmeyen anahtar → boş string.
 */
export function getPrintString(locale: SupportedPrintLocale | string | null | undefined, key: PrintStringKey): string {
  return PRINT_STRINGS[resolvePrintLocale(locale)]?.[key] ?? '';
}

/**
 * Resolve edilen geçerli locale. Geçersiz değerler 'tr' döner. tr-EN dönüşümü yok; exact match.
 */
export function resolvePrintLocale(input?: string | null): SupportedPrintLocale {
  if (!input) return 'tr';
  const s = String(input).trim().toLowerCase();
  if (s === 'tr' || s === 'en' || s === 'ar' || s === 'ku') return s;
  return 'tr';
}

/**
 * Aktif firma/dönem locale'ini döndürür. ERP_SETTINGS.locale yoksa tarayıcı/navigator dilinden düşer,
 * o da tanınmıyorsa 'tr' fallback.
 */
export function getDefaultPrintLocale(): SupportedPrintLocale {
  type ErpWithLocale = { locale?: string };
  let candidate: string | undefined;
  try {
    const globalAny = globalThis as { ERP_SETTINGS?: ErpWithLocale };
    candidate = globalAny.ERP_SETTINGS?.locale;
  } catch {
    candidate = undefined;
  }
  if (!candidate && typeof navigator !== 'undefined') {
    candidate = navigator.language;
  }
  return resolvePrintLocale(candidate);
}

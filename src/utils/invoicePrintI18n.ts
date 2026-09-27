/**
 * Fatura A4 yazdırma / önizleme etiketleri — React context dışında da çalışır
 * (ReactDOMServer.renderToStaticMarkup / printUtils).
 */
import { translate, type Language } from '../locales/module-translations';
import {
  dbPaymentMethodToFormCode,
  paymentMethodTranslationKey,
} from './paymentMethodUtils';

export type InvoicePrintLabels = {
  document: string;
  invoiceNo: string;
  date: string;
  customerDear: string;
  supplierDear: string;
  paymentMethod: string;
  cashierSalesperson: string;
  productService: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  amount: string;
  subTotal: string;
  discountLine: string;
  taxVat: string;
  totalAmount: string;
  electronicNote: string;
  receivedBy: string;
  deliveredBy: string;
  thanksFooter: string;
  noLineItems: string;
  noCustomer: string;
  paymentFallback: string;
  addressUndefined: string;
  phone: string;
  taxOffice: string;
  taxNo: string;
  invoiceFallback: string;
};

const LANGS: Language[] = ['tr', 'en', 'ar', 'ku'];

export function getAppLanguage(): Language {
  try {
    const saved =
      typeof localStorage !== 'undefined' ? localStorage.getItem('retailos_language') : null;
    if (saved && (LANGS as string[]).includes(saved)) return saved as Language;
  } catch {
    /* SSR / private mode */
  }
  return 'tr';
}

export function getInvoicePrintLabels(lang: Language = getAppLanguage()): InvoicePrintLabels {
  const t = (key: string) => translate(key, lang);
  return {
    document: t('invPrintDocument'),
    invoiceNo: t('invoiceNo'),
    date: t('date'),
    customerDear: t('invPrintCustomerDear'),
    supplierDear: t('invPrintSupplierDear'),
    paymentMethod: t('paymentMethod'),
    cashierSalesperson: t('invPrintCashierSalesperson'),
    productService: t('invPrintProductService'),
    quantity: t('quantity'),
    unitPrice: t('unitPrice'),
    discount: t('discount'),
    amount: t('amount'),
    subTotal: t('subTotal'),
    discountLine: t('discount'),
    taxVat: t('invPrintTaxVat'),
    totalAmount: t('totalAmount'),
    electronicNote: t('invPrintElectronicNote'),
    receivedBy: t('invPrintReceivedBy'),
    deliveredBy: t('invPrintDeliveredBy'),
    thanksFooter: t('invPrintThanksFooter'),
    noLineItems: t('invPrintNoLineItems'),
    noCustomer: t('invPrintNoCustomer'),
    paymentFallback: t('invPrintPaymentFallback'),
    addressUndefined: t('invPrintAddressUndefined'),
    phone: t('phoneShort'),
    taxOffice: t('custLabelTaxOffice'),
    taxNo: t('taxNumberLabel'),
    invoiceFallback: t('invoice'),
  };
}

/** DB’deki Veresiye / Nakit vb. → aktif dil etiketi */
export function localizePaymentMethodForPrint(
  raw: unknown,
  lang: Language = getAppLanguage(),
): string {
  const s = String(raw ?? '').trim();
  if (!s) return translate('invPrintPaymentFallback', lang);
  const code = dbPaymentMethodToFormCode(s);
  if (code === 'ACIK_CARI') {
    // Belgede kısa “Veresiye” / “On account” tercih edilir
    return translate('paymentCredit', lang);
  }
  const key = paymentMethodTranslationKey(s);
  const label = translate(key, lang);
  if (!label || label === key || key === 'openTerms') return s;
  return label;
}

/** Yaygın birim adlarını dile çevir (Adet → Piece vb.) */
export function localizeUnitForPrint(
  unit: unknown,
  lang: Language = getAppLanguage(),
): string {
  const u = String(unit ?? '').trim();
  if (!u) return '';
  const lower = u.toLocaleLowerCase('tr-TR');
  if (lower === 'adet' || lower === 'ad.' || lower === 'ad' || lower === 'pcs' || lower === 'piece' || lower === 'ea') {
    return translate('unitPiece', lang);
  }
  return u;
}

/** Dizayn Merkezi {{lbl*}} bağlamı — satış + alış şablonları */
export function buildInvoicePrintLabelContext(
  lang: Language = getAppLanguage(),
): Record<string, string> {
  const L = getInvoicePrintLabels(lang);
  return {
    lblDocument: L.document,
    lblInvoiceNo: L.invoiceNo,
    lblDate: L.date,
    lblCustomer: L.customerDear,
    lblSupplier: L.supplierDear,
    lblPaymentMethod: L.paymentMethod,
    lblCashier: L.cashierSalesperson,
    lblProductService: L.productService,
    lblQuantity: L.quantity,
    lblUnitPrice: L.unitPrice,
    lblDiscount: L.discount,
    lblAmount: L.amount,
    lblSubTotal: L.subTotal,
    lblTax: L.taxVat,
    lblTotal: L.totalAmount,
    lblReceivedBy: L.receivedBy,
    lblDeliveredBy: L.deliveredBy,
    lblElectronicNote: L.electronicNote,
    lblThanks: L.thanksFooter,
    lblAddressUndefined: L.addressUndefined,
  };
}

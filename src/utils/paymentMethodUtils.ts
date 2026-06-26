/** Form ödeme kodları (InvoicePaymentInfoModal) */
export type PaymentFormCode = 'NAKIT' | 'KREDIKARTI' | 'HAVAL' | 'CEK' | 'SENET';

const FORM_CODES: PaymentFormCode[] = ['NAKIT', 'KREDIKARTI', 'HAVAL', 'CEK', 'SENET'];

/** DB / POS değerini forma yüklenecek koda çevirir */
export function dbPaymentMethodToFormCode(raw: unknown): PaymentFormCode | '' {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (FORM_CODES.includes(upper as PaymentFormCode)) return upper as PaymentFormCode;
  const lower = s.toLowerCase();
  if (lower === 'cash' || lower === 'nakit') return 'NAKIT';
  if (lower === 'card' || lower === 'kart' || lower === 'kredi karti' || lower === 'kredi kartı') return 'KREDIKARTI';
  if (lower === 'havale' || lower === 'eft') return 'HAVAL';
  if (lower === 'cek' || lower === 'çek') return 'CEK';
  if (lower === 'senet') return 'SENET';
  return '';
}

/** Form kodunu DB'ye yazılacak değere çevirir (POS perakende satışlar cash/card kullanır) */
export function formCodeToDbPaymentMethod(
  formCode: string,
  opts?: { posRetail?: boolean }
): string {
  const code = String(formCode || '').trim().toUpperCase();
  if (!code) return opts?.posRetail ? 'cash' : 'Nakit';

  if (opts?.posRetail) {
    if (code === 'NAKIT') return 'cash';
    if (code === 'KREDIKARTI') return 'card';
    return code.toLowerCase();
  }

  switch (code) {
    case 'NAKIT':
      return 'Nakit';
    case 'KREDIKARTI':
      return 'Kredi Kartı';
    case 'HAVAL':
      return 'Havale';
    case 'CEK':
      return 'Çek';
    case 'SENET':
      return 'Senet';
    default:
      return formCode;
  }
}

/** UI etiketi için ham DB / form değerinden tm() anahtarı döndürür */
export function paymentMethodTranslationKey(raw: unknown): string {
  const code = dbPaymentMethodToFormCode(raw);
  return paymentFormCodeTranslationKey(code);
}

export function paymentFormCodeTranslationKey(code: string): string {
  switch (String(code || '').trim().toUpperCase()) {
    case 'NAKIT':
      return 'paymentCash';
    case 'KREDIKARTI':
      return 'paymentCreditCard';
    case 'HAVAL':
      return 'paymentTransfer';
    case 'CEK':
      return 'paymentCheck';
    case 'SENET':
      return 'paymentPromissory';
    default:
      return 'openTerms';
  }
}

/** POS / rapor listelerinde kullanılan ödeme grubu */
export type PaymentMethodBucket = 'cash' | 'card' | 'credit' | 'transfer' | 'other';

/** DB / form ham değerini rapor ve POS listelerinde kullanılan gruba çevirir */
export function normalizePaymentMethodBucket(raw: unknown): PaymentMethodBucket {
  const formCode = dbPaymentMethodToFormCode(raw);
  if (formCode === 'NAKIT') return 'cash';
  if (formCode === 'KREDIKARTI') return 'card';
  if (formCode === 'HAVAL') return 'transfer';
  if (formCode === 'CEK' || formCode === 'SENET') return 'other';

  const pm = String(raw ?? '').toLowerCase().trim();
  if (!pm) return 'cash';
  if (pm === 'cash' || pm === 'nakit') return 'cash';
  if (pm === 'card' || pm === 'kart' || pm === 'gateway' || pm.includes('kredi')) return 'card';
  if (pm === 'veresiye' || pm === 'credit' || pm === 'cari' || pm.includes('borc') || pm.includes('borç')) {
    return 'credit';
  }
  if (pm === 'havale' || pm === 'eft' || pm === 'transfer') return 'transfer';
  return 'other';
}

/** tm() anahtarı — rapor tablosu rozetleri için */
export function paymentMethodBucketTranslationKey(bucket: PaymentMethodBucket): string {
  switch (bucket) {
    case 'cash':
      return 'cashLabel';
    case 'card':
      return 'cardLabel';
    case 'credit':
      return 'paymentCredit';
    case 'transfer':
      return 'reportsPaymentPieTransfer';
    default:
      return 'reportsPaymentOther';
  }
}

/** Logo trcode 7 = perakende satış faturası (MarketPOS) */
export const RETAIL_SALES_INVOICE_TRCODE = 7;

/** POS perakende satışları DB'de cash/card kullanır */
export function isPosRetailPaymentContext(ctx: {
  source?: unknown;
  paymentMethod?: unknown;
  invoiceTypeCode?: number;
  cashier?: unknown;
}): boolean {
  if (String(ctx.source || '').toLowerCase() === 'pos') return true;
  const trcode = Number(ctx.invoiceTypeCode ?? 0);
  if (trcode === RETAIL_SALES_INVOICE_TRCODE) return true;
  const formCode = dbPaymentMethodToFormCode(ctx.paymentMethod);
  if (formCode === 'NAKIT' || formCode === 'KREDIKARTI') return true;
  const pm = String(ctx.paymentMethod || '').trim().toLowerCase();
  if (pm === 'cash' || pm === 'card') return true;
  if (ctx.cashier != null && String(ctx.cashier).trim() !== '') return true;
  return false;
}

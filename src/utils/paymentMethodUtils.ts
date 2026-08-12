/** Form ödeme kodları (InvoicePaymentInfoModal) */
export type PaymentFormCode = 'NAKIT' | 'KREDIKARTI' | 'ACIK_CARI' | 'HAVAL' | 'CEK' | 'SENET';

const FORM_CODES: PaymentFormCode[] = ['NAKIT', 'KREDIKARTI', 'ACIK_CARI', 'HAVAL', 'CEK', 'SENET'];

/** DB / POS değerini forma yüklenecek koda çevirir */
export function dbPaymentMethodToFormCode(raw: unknown): PaymentFormCode | '' {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (FORM_CODES.includes(upper as PaymentFormCode)) return upper as PaymentFormCode;
  const lower = s.toLowerCase();
  if (lower === 'cash' || lower === 'nakit') return 'NAKIT';
  if (lower === 'card' || lower === 'kart' || lower === 'kredi karti' || lower === 'kredi kartı') return 'KREDIKARTI';
  if (
    lower === 'veresiye' ||
    lower === 'open_account' ||
    lower === 'açık hesap' ||
    lower === 'acik hesap' ||
    lower === 'açık cari' ||
    lower === 'acik cari' ||
    lower === 'cari'
  ) {
    return 'ACIK_CARI';
  }
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
  if (!code || code === 'ACIK_CARI') {
    return opts?.posRetail ? 'veresiye' : 'Veresiye';
  }

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
    case 'ACIK_CARI':
      return 'Veresiye';
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
    case 'ACIK_CARI':
      return 'paymentOpenAccount';
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
  if (!formCode || formCode === 'ACIK_CARI') return 'credit';
  if (formCode === 'NAKIT') return 'cash';
  if (formCode === 'KREDIKARTI') return 'card';
  if (formCode === 'HAVAL') return 'transfer';
  if (formCode === 'CEK' || formCode === 'SENET') return 'other';

  const pm = String(raw ?? '').toLowerCase().trim();
  if (!pm) return 'credit';
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

/** Nakit/kart tahsilat yapıldı mı (açık cari / veresiye değil) */
export function paymentMethodImpliesPaidNow(raw: unknown): boolean {
  const code = dbPaymentMethodToFormCode(raw);
  if (!code || code === 'ACIK_CARI') return false;
  if (code === 'NAKIT' || code === 'KREDIKARTI') return true;
  const pm = String(raw ?? '').toLowerCase().trim();
  return pm === 'cash' || pm === 'nakit' || pm === 'card' || pm === 'kart' || pm === 'credit_card' || pm === 'pos';
}

/**
 * Satışta cari borç (müşteri bize borçlu) yalnızca veresiye / açık hesap.
 * Nakit, kart, havale için balance artırılmaz.
 */
export function paymentMethodImpliesCustomerDebt(pm: string | undefined | null): boolean {
  const code = dbPaymentMethodToFormCode(pm);
  if (code === 'ACIK_CARI') return true;
  const p = String(pm || '').toLowerCase().trim();
  if (!p) return false;
  if (p === 'veresiye' || p === 'open_account' || p === 'acik_cari' || p === 'açık_cari') return true;
  if (p.includes('veresiye')) return true;
  if (
    p === 'cari' ||
    p === 'açık hesap' ||
    p === 'acik hesap' ||
    p === 'açık cari' ||
    p === 'acik cari'
  ) {
    return true;
  }
  return false;
}

/**
 * Alışta tedarikçi borcu: peşin nakit/kart/havale kapalı; boş veya veresiye/çek/senet açık.
 */
export function paymentMethodImpliesSupplierDebt(pm: string | undefined | null): boolean {
  const p = String(pm || '').toLowerCase().trim();
  if (!p) return true;
  if (paymentMethodImpliesPaidNow(pm)) return false;
  if (p === 'havale' || p === 'eft' || p === 'haval' || p === 'transfer') return false;
  return true;
}

/** Ledger SQL: satış satırı cari borç yaratır mı */
export function sqlPaymentMethodImpliesCustomerDebtExpr(alias = ''): string {
  const col = alias ? `${alias}.payment_method` : 'payment_method';
  return `(
    LOWER(TRIM(COALESCE(${col}, ''))) IN (
      'veresiye', 'open_account', 'cari', 'açık hesap', 'acik hesap',
      'açık cari', 'acik cari', 'acik_cari', 'açık_cari'
    )
    OR LOWER(TRIM(COALESCE(${col}, ''))) LIKE '%veresiye%'
  )`;
}

/** Ledger SQL: alış satırı tedarikçi borcu yaratır mı (peşin nakit/kart/havale hariç) */
export function sqlPaymentMethodImpliesSupplierDebtExpr(alias = ''): string {
  const col = alias ? `${alias}.payment_method` : 'payment_method';
  const pm = `LOWER(TRIM(COALESCE(${col}, '')))`;
  return `(
    NOT (
      ${pm} IN ('cash', 'nakit', 'card', 'kart', 'gateway', 'havale', 'eft', 'haval', 'kredikarti', 'transfer')
      OR ${pm} LIKE '%kredi%kart%'
    )
  )`;
}

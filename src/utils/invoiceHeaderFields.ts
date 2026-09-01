/** Fatura başlık alanları — sales.header_fields JSONB ile kalıcı */
export type InvoiceHeaderFields = {
  documentNo?: string;
  specialCode?: string;
  tradingGroup?: string;
  authorizationCode?: string;
  warehouse?: string;
  workplace?: string;
  salespersonCode?: string;
  editDate?: string;
  customerBarcode?: string;
  deliveryCode?: string;
  campaignCode?: string;
  time?: string;
  /** Dip (fatura seviyesi) indirim: percentage | amount */
  footerDiscountMode?: string;
  /** Dip indirim yüzdesi (string; JSONB uyumu) */
  footerDiscountPercent?: string;
  /** Dip indirim tutarı — fatura dövizinde */
  footerDiscountAmount?: string;
  /** Ödeme sırasında seçilen kasa bilgisi (Market POS pattern, JSON) */
  cash_register_id?: string;
  cash_register_name?: string;
  cash_register_code?: string;
  /**
   * Çoklu ödeme satırları (Market POS pattern). Her satır kendi yöntemini,
   * tutarını, kasasını taşır. Boşsa tek-ödeme modu kullanılır ve bilgi
   * `cash_register_id` alanından çıkarılır.
   */
  payments?: Array<{
    method: string;
    amount: number;
    currency: 'IQD' | 'USD' | 'EUR';
    cash_register_id: string | null;
    cash_register_name?: string | null;
    cash_register_code?: string | null;
    notes?: string;
  }>;
};

export function readInvoiceHeaderFields(raw: unknown): InvoiceHeaderFields {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as InvoiceHeaderFields;
}

export function getInvoiceHeaderField(
  inv: { header_fields?: unknown } | null | undefined,
  key: keyof InvoiceHeaderFields,
): string {
  const fields = readInvoiceHeaderFields(inv?.header_fields);
  return String(fields[key] ?? '').trim();
}

export function buildInvoiceHeaderFieldsFromForm(input: {
  documentNo?: string;
  specialCode?: string;
  tradingGroup?: string;
  authorizationCode?: string;
  warehouse?: string;
  workplace?: string;
  salespersonCode?: string;
  editDate?: string;
  customerBarcode?: string;
  deliveryCode?: string;
  campaignCode?: string;
  time?: string;
  footerDiscountMode?: string;
  footerDiscountPercent?: string | number;
  footerDiscountAmount?: string | number;
  cashRegister?: { id?: string | null; name?: string | null; code?: string | null };
  payments?: InvoiceHeaderFields['payments'];
}): InvoiceHeaderFields {
  const out: InvoiceHeaderFields = {};
  const set = (key: keyof InvoiceHeaderFields, val?: string | null) => {
    const v = String(val ?? '').trim();
    if (v) (out as Record<string, unknown>)[key] = v;
  };
  set('documentNo', input.documentNo);
  set('specialCode', input.specialCode);
  set('tradingGroup', input.tradingGroup);
  set('authorizationCode', input.authorizationCode);
  set('warehouse', input.warehouse);
  set('workplace', input.workplace);
  set('salespersonCode', input.salespersonCode);
  set('editDate', input.editDate);
  set('customerBarcode', input.customerBarcode);
  set('deliveryCode', input.deliveryCode);
  set('campaignCode', input.campaignCode);
  set('time', input.time);
  const mode = String(input.footerDiscountMode ?? '').trim();
  if (mode === 'percentage' || mode === 'amount') {
    out.footerDiscountMode = mode;
  }
  const pct = Number(input.footerDiscountPercent);
  const amt = Number(input.footerDiscountAmount);
  if (Number.isFinite(pct) && pct > 0) {
    out.footerDiscountPercent = String(pct);
  }
  if (Number.isFinite(amt) && amt > 0) {
    out.footerDiscountAmount = String(amt);
  }
  if (input.cashRegister) {
    set('cash_register_id', input.cashRegister.id);
    set('cash_register_name', input.cashRegister.name);
    set('cash_register_code', input.cashRegister.code);
  }
  if (Array.isArray(input.payments) && input.payments.length > 0) {
    out.payments = input.payments.map((p) => ({
      method: String(p?.method ?? ''),
      amount: Number(p?.amount ?? 0) || 0,
      currency: (p?.currency ?? 'IQD') as 'IQD' | 'USD' | 'EUR',
      cash_register_id: p?.cash_register_id ?? null,
      cash_register_name: p?.cash_register_name ?? null,
      cash_register_code: p?.cash_register_code ?? null,
      notes: p?.notes,
    }));
  }
  return out;
}

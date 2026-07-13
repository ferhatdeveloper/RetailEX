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
}): InvoiceHeaderFields {
  const out: InvoiceHeaderFields = {};
  const set = (key: keyof InvoiceHeaderFields, val?: string) => {
    const v = String(val ?? '').trim();
    if (v) out[key] = v;
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
  return out;
}

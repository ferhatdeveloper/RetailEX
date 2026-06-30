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
  return out;
}

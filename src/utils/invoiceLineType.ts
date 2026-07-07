/** Fatura satırı Tür alanı — Malzeme / Hizmet / İndirim (UI + sale_items.item_type) */

export function canonicalInvoiceLineType(raw: string | undefined): string {
  const t = (raw || '').trim();
  if (!t || t === 'Malzeme' || t === 'Material' || t === 'material' || t === 'product' || t === 'مادة' || t === 'ماددە') {
    return 'Malzeme';
  }
  if (t === 'Hizmet' || t === 'Service' || t === 'service' || t === 'خدمة' || t === 'خزمەتگوزاری') {
    return 'Hizmet';
  }
  if (t === 'İndirim' || t === 'Discount' || t === 'discount' || t === 'خصم' || t === 'داشکاندن') {
    return 'İndirim';
  }
  return 'Malzeme';
}

export function isInvoiceServiceLineType(type: string | undefined): boolean {
  return canonicalInvoiceLineType(type) === 'Hizmet';
}

export function isInvoiceMaterialLineType(type: string | undefined): boolean {
  return canonicalInvoiceLineType(type) === 'Malzeme';
}

/** Veritabanı sale_items.item_type — Türkçe sabit değer */
export function invoiceLineTypeToDb(type: string | undefined): string {
  return canonicalInvoiceLineType(type);
}

export function dbItemTypeToInvoiceLine(raw: string | undefined): string {
  return canonicalInvoiceLineType(raw);
}

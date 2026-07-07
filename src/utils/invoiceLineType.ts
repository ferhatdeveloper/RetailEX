/** Fatura satırı Tür alanı — Malzeme / Hizmet / Promosyon / İndirim (UI + sale_items.item_type) */

export function canonicalInvoiceLineType(raw: string | undefined): string {
  const t = (raw || '').trim();
  if (!t || t === 'Malzeme' || t === 'Material' || t === 'material' || t === 'product' || t === 'مادة' || t === 'ماددە') {
    return 'Malzeme';
  }
  if (t === 'Hizmet' || t === 'Service' || t === 'service' || t === 'خدمة' || t === 'خزمەتگوزاری') {
    return 'Hizmet';
  }
  if (
    t === 'Promosyon' ||
    t === 'Promotion' ||
    t === 'promotion' ||
    t === 'promotional' ||
    t === 'ترويج' ||
    t === 'پڕۆمۆشن'
  ) {
    return 'Promosyon';
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

export function isInvoicePromotionLineType(type: string | undefined): boolean {
  return canonicalInvoiceLineType(type) === 'Promosyon';
}

/** Alışta malzeme + promosyon stok artırır; satışta yalnızca malzeme stok düşer */
export function isInvoiceStockLineType(type: string | undefined, invoiceCategory?: string): boolean {
  const canonical = canonicalInvoiceLineType(type);
  if (invoiceCategory === 'Alis') {
    return canonical === 'Malzeme' || canonical === 'Promosyon';
  }
  return canonical === 'Malzeme';
}

/** Tedarikçi borcuna yazılacak satırlar — promosyon ve indirim hariç */
export function isInvoiceSupplierPayableLineType(type: string | undefined): boolean {
  const canonical = canonicalInvoiceLineType(type);
  return canonical !== 'Promosyon' && canonical !== 'İndirim';
}

export function invoiceLinePayableNetAmount(item: {
  type?: string;
  netAmount?: number;
  total?: number;
  quantity?: number;
  unitPrice?: number;
  discountAmount?: number;
}): number {
  if (!isInvoiceSupplierPayableLineType(item.type)) return 0;
  const net = Number(item.netAmount ?? item.total ?? NaN);
  if (Number.isFinite(net)) return Math.max(0, net);
  const qty = Number(item.quantity ?? 0);
  const price = Number(item.unitPrice ?? 0);
  const disc = Number(item.discountAmount ?? 0);
  return Math.max(0, qty * price - disc);
}

export function computePurchaseInvoicePayableTotal(
  items: Array<{
    type?: string;
    netAmount?: number;
    total?: number;
    quantity?: number;
    unitPrice?: number;
    discountAmount?: number;
  }>,
): number {
  return items.reduce((sum, item) => sum + invoiceLinePayableNetAmount(item), 0);
}

/** Veritabanı sale_items.item_type — Türkçe sabit değer */
export function invoiceLineTypeToDb(type: string | undefined): string {
  return canonicalInvoiceLineType(type);
}

export function dbItemTypeToInvoiceLine(raw: string | undefined): string {
  return canonicalInvoiceLineType(raw);
}

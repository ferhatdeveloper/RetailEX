/**
 * Fatura satır karışımı: ürün / hizmet / karma.
 * Liste kolonu ve getPaginated zenginleştirmesi için.
 */

export type InvoiceLineMix = 'product' | 'service' | 'mixed' | 'unknown';

const SERVICE_TYPES = new Set(['hizmet', 'service', 'package', 'paket']);
const SKIP_TYPES = new Set(['promosyon', 'indirim', 'discount', 'promo']);

export function isSkippedInvoiceLineType(itemType: string | null | undefined): boolean {
  return SKIP_TYPES.has(String(itemType || '').trim().toLowerCase());
}

export function isServiceInvoiceLineType(itemType: string | null | undefined): boolean {
  const raw = String(itemType || 'Malzeme').trim().toLowerCase();
  return SERVICE_TYPES.has(raw);
}

export function classifyInvoiceLineMix(args: {
  hasProduct?: boolean;
  hasService?: boolean;
  invoiceType?: number | null;
  invoiceCategory?: string | null;
}): InvoiceLineMix {
  const hasProduct = !!args.hasProduct;
  const hasService = !!args.hasService;
  if (hasProduct && hasService) return 'mixed';
  if (hasService) return 'service';
  if (hasProduct) return 'product';

  const t = Number(args.invoiceType || 0);
  if (t === 9 || t === 4) return 'service';
  const cat = String(args.invoiceCategory || '').trim().toLocaleLowerCase('tr');
  if (cat === 'hizmet') return 'service';
  if (t === 7 || t === 8 || t === 1) return 'product';
  return 'unknown';
}

export function invoiceLineMixFromItemTypes(
  itemTypes: Array<string | null | undefined>,
  header?: { invoiceType?: number | null; invoiceCategory?: string | null },
): InvoiceLineMix {
  let hasProduct = false;
  let hasService = false;
  for (const raw of itemTypes) {
    if (isSkippedInvoiceLineType(raw)) continue;
    if (isServiceInvoiceLineType(raw)) hasService = true;
    else hasProduct = true;
  }
  return classifyInvoiceLineMix({
    hasProduct,
    hasService,
    invoiceType: header?.invoiceType,
    invoiceCategory: header?.invoiceCategory,
  });
}

export function invoiceLineMixLabelKey(mix: InvoiceLineMix | null | undefined): string {
  switch (mix) {
    case 'product':
      return 'product';
    case 'service':
      return 'service';
    case 'mixed':
      return 'lineMixMixed';
    default:
      return 'lineMixUnknown';
  }
}

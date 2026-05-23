import type { TemplateElement, TemplateType } from '../core/types/templates';
import type { Invoice } from '../core/types';
import { buildInvoicePrintContext, interpolateTemplateText } from './templateRenderService';
import { buildLabelTemplateFieldValues } from './labelTemplateRender';
import {
  buildDemoInvoicePreviewContext,
  buildDemoLabelPreviewContext,
} from './templateFieldCatalog';
import { formatNumber } from '../utils/formatNumber';

export type DesignerPreviewSource = 'demo' | 'database';

export interface DesignerPreviewState {
  source: DesignerPreviewSource;
  context: Record<string, unknown>;
  loadedFromDb: boolean;
  error?: string;
}

function labelFieldsToContext(fields: ReturnType<typeof buildLabelTemplateFieldValues>): Record<string, unknown> {
  return { ...fields };
}

function productToLabelContext(product: Record<string, unknown>): Record<string, unknown> {
  const price = Number(product.price ?? 0);
  const fields = buildLabelTemplateFieldValues({
    productName: String(product.name ?? product.productName ?? ''),
    barcode: String(product.barcode ?? product.code ?? ''),
    variantCode: String(product.code ?? ''),
    salePrice: Number.isFinite(price) ? price : 0,
    currency: String(product.currency ?? '₺'),
    category: String(product.category_code ?? product.category ?? ''),
    stock: Number(product.stock ?? 0),
    sku: String(product.code ?? ''),
    description: String(product.name2 ?? product.description ?? ''),
    specialCode2: String(product.special_code_2 ?? ''),
  });
  return labelFieldsToContext(fields);
}

export async function loadDesignerPreviewContext(
  type: TemplateType,
  source: DesignerPreviewSource,
): Promise<DesignerPreviewState> {
  if (source === 'demo') {
    return {
      source: 'demo',
      loadedFromDb: false,
      context: type === 'invoice' ? buildDemoInvoicePreviewContext() : buildDemoLabelPreviewContext(),
    };
  }

  try {
    if (type === 'invoice') {
      const { invoicesAPI } = await import('./api/invoices');
      const page = await invoicesAPI.getPaginated({ page: 1, pageSize: 1 });
      const row = page?.data?.[0];
      if (!row?.id) {
        return {
          source: 'database',
          loadedFromDb: false,
          context: buildDemoInvoicePreviewContext(),
          error: 'Veritabanında fatura bulunamadı; örnek veri kullanılıyor.',
        };
      }
      const full = await invoicesAPI.getById(String(row.id));
      if (!full) {
        return {
          source: 'database',
          loadedFromDb: false,
          context: buildDemoInvoicePreviewContext(),
          error: 'Fatura detayı yüklenemedi.',
        };
      }
      const ctx = buildInvoicePrintContext(full as Invoice);
      const items = (ctx.items as Record<string, unknown>[]) || [];
      if (items.length > 0) {
        ctx.item = items[0];
      }
      if (!ctx.storeTaxNo) {
        ctx.storeTaxNo = '';
      }
      return { source: 'database', loadedFromDb: true, context: ctx };
    }

    const { productAPI } = await import('./api/products');
    const products = await productAPI.getAllForReports();
    const product = (products?.[0] as unknown as Record<string, unknown> | undefined) ?? null;
    if (!product) {
      return {
        source: 'database',
        loadedFromDb: false,
        context: buildDemoLabelPreviewContext(),
        error: 'Veritabanında ürün bulunamadı; örnek veri kullanılıyor.',
      };
    }
    return {
      source: 'database',
      loadedFromDb: true,
      context: productToLabelContext(product),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      source: 'database',
      loadedFromDb: false,
      context: type === 'invoice' ? buildDemoInvoicePreviewContext() : buildDemoLabelPreviewContext(),
      error: message || 'Veritabanı bağlantı hatası',
    };
  }
}

export function getElementDisplayText(
  element: TemplateElement,
  previewContext: Record<string, unknown> | null,
  previewMode: boolean,
): string {
  const raw = element.content || element.field || '';
  if (!previewMode || !previewContext) return raw || (element.type === 'text' ? 'Metin' : '');
  if (element.type === 'text' || element.type === 'barcode') {
    return interpolateTemplateText(raw, previewContext);
  }
  return raw;
}

export function getBarcodePreviewValue(
  element: TemplateElement,
  previewContext: Record<string, unknown> | null,
  previewMode: boolean,
): string {
  const token = element.field || element.content || '{{barcode}}';
  if (!previewMode || !previewContext) return '';
  const text = interpolateTemplateText(token.includes('{{') ? token : `{{${token.replace(/[{}]/g, '')}}}`, previewContext);
  return text || String(previewContext.barcode ?? '8690000000000');
}

export interface PreviewTableRow {
  productName: string;
  quantity: string;
  unitPrice: string;
  total: string;
}

export function getPreviewTableRows(previewContext: Record<string, unknown> | null): PreviewTableRow[] {
  const items = previewContext?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return [
      {
        productName: 'Örnek ürün',
        quantity: '1',
        unitPrice: formatNumber(100, 2, true),
        total: formatNumber(100, 2, true),
      },
    ];
  }
  return items.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      productName: String(r.productName ?? r.name ?? r.description ?? ''),
      quantity: String(r.quantity ?? ''),
      unitPrice: formatNumber(Number(r.unitPrice ?? r.unit_price ?? 0), 2, true),
      total: formatNumber(Number(r.total ?? r.netAmount ?? 0), 2, true),
    };
  });
}

/**
 * SKT raporu → alış iade (Logo trcode 6).
 * Tedarikçi = kaynak alış faturasının carisi. Stok çıkar, tedarikçi borcu azalır.
 * Satış iadesi (trcode 2/3) veya müşteri carisi kullanılmaz.
 */
import type { Invoice } from '../core/types/models';
import { looksLikeUuid } from './pgUuid';
import { splitInvoiceLineIdentity } from './invoiceLineDisplayCode';
import { formCodeToDbPaymentMethod } from './paymentMethodUtils';
import { PURCHASE_RETURN_TRCODE, SALES_RETURN_TRCODES } from './lastPurchaseCostSql';

export type ExpiryReturnSource = {
  invoiceId: string;
  invoiceNo: string;
  invoiceDate: string;
  supplierId?: string;
  supplierName: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  batchNo?: string;
  productId?: string;
  unitPrice?: number;
  vatRate?: number;
  discountRate?: number;
  trcode?: number;
  ficheType?: string;
};

export function isAlreadyReturnDocument(trcode?: number, ficheType?: string): boolean {
  const tc = Number(trcode || 0);
  if (tc === PURCHASE_RETURN_TRCODE) return true;
  if ((SALES_RETURN_TRCODES as readonly number[]).includes(tc)) return true;
  return String(ficheType || '').toLowerCase() === 'return_invoice';
}

export function canReturnExpiringPurchase(row: {
  invoiceId?: string;
  supplierId?: string;
  trcode?: number;
  ficheType?: string;
}): boolean {
  if (!String(row.invoiceId || '').trim()) return false;
  if (!looksLikeUuid(row.supplierId)) return false;
  if (isAlreadyReturnDocument(row.trcode, row.ficheType)) return false;
  return true;
}

export function clampExpiryReturnQty(qty: number, maxQty: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const max = Number.isFinite(maxQty) && maxQty > 0 ? maxQty : qty;
  return Math.min(qty, max);
}

export function expiryReturnLineAmounts(args: {
  quantity: number;
  unitPrice: number;
  discountRate?: number;
  vatRate?: number;
}): { subtotal: number; discount: number; lineNet: number; tax: number; total: number } {
  const qty = Number(args.quantity) || 0;
  const price = Number(args.unitPrice) || 0;
  const discPct = Math.max(0, Number(args.discountRate) || 0);
  const vatPct = Math.max(0, Number(args.vatRate) || 0);
  const subtotal = roundMoney(qty * price);
  const discount = roundMoney(subtotal * (discPct / 100));
  const lineNet = roundMoney(subtotal - discount);
  const tax = roundMoney(lineNet * (vatPct / 100));
  const total = roundMoney(lineNet + tax);
  return { subtotal, discount, lineNet, tax, total };
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function buildExpiryPurchaseReturnInvoice(args: {
  source: ExpiryReturnSource;
  quantity: number;
  firmaId: string;
  firmaName?: string;
  donemId: string;
  donemName?: string;
}): Invoice {
  const qty = clampExpiryReturnQty(args.quantity, Number(args.source.quantity) || 0);
  const unitPrice = Number(args.source.unitPrice) || 0;
  const { subtotal, discount, tax, total } = expiryReturnLineAmounts({
    quantity: qty,
    unitPrice,
    discountRate: args.source.discountRate,
    vatRate: args.source.vatRate,
  });
  const identity = splitInvoiceLineIdentity({
    item_code: args.source.itemCode,
    code: args.source.itemCode,
    product_id: args.source.productId,
    productId: args.source.productId,
  });
  const productId = identity.productId || (looksLikeUuid(args.source.productId) ? String(args.source.productId) : '');
  const code = identity.code || args.source.itemCode || '';
  const supplierId = String(args.source.supplierId || '').trim();
  const supplierName = String(args.source.supplierName || '').trim();
  const notes = [
    'SKT alış iadesi',
    args.source.invoiceNo ? `Kaynak alış: ${args.source.invoiceNo}` : '',
    args.source.expiryDate ? `SKT: ${args.source.expiryDate}` : '',
    args.source.batchNo ? `Parti: ${args.source.batchNo}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    invoice_no: '',
    invoice_date: new Date().toISOString(),
    invoice_type: PURCHASE_RETURN_TRCODE,
    invoice_category: 'Iade',
    customer_id: supplierId,
    customer_name: supplierName,
    supplier_id: supplierId,
    supplier_name: supplierName,
    total_amount: total,
    total,
    subtotal,
    discount,
    tax,
    items: [
      {
        type: 'Malzeme',
        productId: productId || code,
        code,
        description: args.source.itemName,
        productName: args.source.itemName,
        quantity: qty,
        unit: args.source.unit || 'Adet',
        unitPrice,
        price: unitPrice,
        discount: Number(args.source.discountRate) || 0,
        discountPercent: Number(args.source.discountRate) || 0,
        taxRate: Number(args.source.vatRate) || 0,
        tax,
        netAmount: total,
        total,
        expiryDate: args.source.expiryDate || undefined,
        batchNo: args.source.batchNo || undefined,
      },
    ],
    firma_id: String(args.firmaId || '0'),
    firma_name: args.firmaName || '',
    donem_id: String(args.donemId || '01'),
    donem_name: args.donemName || '',
    payment_method: formCodeToDbPaymentMethod('ACIK_CARI'),
    status: 'completed',
    notes,
    source: 'invoice',
    header_fields: {
      skt_return: true,
      source_invoice_id: args.source.invoiceId || '',
      source_invoice_no: args.source.invoiceNo || '',
    },
  };
}
